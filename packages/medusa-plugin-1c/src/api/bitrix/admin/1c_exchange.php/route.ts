import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import * as zlib from "zlib";
import { MedusaError } from "@medusajs/utils";
import { onecExchangeWorkflow } from "../../../../workflows/onec_exchange_workflow";
import OneCSettingsService from "../../../../modules/1c/service";
import { ONE_C_MODULE } from "../../../../modules/1c";

const active1CSessions = new Map<string, string>();

function sendPlainTextResponse(
	res: MedusaResponse,
	statusCode: number,
	content: string,
) {
	res.setHeader("Content-Type", "text/plain; charset=utf-8");
	res.status(statusCode).send(content);
}

function isAuthValid(req: MedusaRequest) {
	if (req.headers.cookie) {
		const cookies = req.headers.cookie.split("; ");
		for (const cookie of cookies) {
			const parts = cookie.split("=");
			const name = parts.shift()?.trim();
			const value = parts.join("=")?.trim();
			if (
				name &&
				value &&
				active1CSessions.has(value) &&
				active1CSessions.get(value) === name
			) {
				return true;
			}
		}
	}
	return false;
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
	const logger = req.scope.resolve("logger");
	const oneCSettingsService: OneCSettingsService =
		req.scope.resolve(ONE_C_MODULE);

	const settings = await oneCSettingsService.getSettings();

	const { type, mode, filename } = req.query as {
		type?: string;
		mode?: string;
		filename?: string;
	};

	let oneCAuthValid = true;

	if (type === "catalog") {
		if (mode != "checkauth") {
			if (
				!req.headers.authorization ||
				!settings?.login ||
				!settings?.password
			) {
				oneCAuthValid = false;
			} else {
				const [login, password] = Buffer.from(
					req.headers.authorization.split(" ")[1],
					"base64",
				)
					.toString()
					.split(":");
				if (
					login !== settings.login ||
					password !== settings.password
				) {
					oneCAuthValid = false;
				}
			}
			if (!oneCAuthValid) {
				logger.debug(
					"[1C Integration] Init: Authentication failed (1C session cookie missing or invalid).",
				);
				return sendPlainTextResponse(
					res,
					401,
					`failure\nAuthentication failed for ${mode}`,
				);
			}
		}

		switch (mode) {
			case "checkauth":
				const newCookieName = "medusa_1c_session_id";
				const newCookieValue = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
				active1CSessions.set(newCookieValue, newCookieName);
				logger.debug(
					`[1C Integration] Checkauth: New session ${newCookieName}=${newCookieValue}`,
				);
				return sendPlainTextResponse(
					res,
					200,
					`success\n${newCookieName}\n${newCookieValue}`,
				);

			case "init":
				logger.debug(`[1C Integration] Init`);
				const zipSupported = settings?.useZip ? "yes" : "no";
				const fileLimit = settings?.chunkSize ?? 1000 * 1024 * 1024;
				return sendPlainTextResponse(
					res,
					200,
					`zip=${zipSupported}\nfile_limit=${fileLimit}`,
				);

			case "import":
				return sendPlainTextResponse(res, 200, `success`);

			case "query":
				logger.debug(`[1C Integration] Query: Export not implemented.`);
				return sendPlainTextResponse(
					res,
					200,
					`failure\nExport functionality (query mode) is not implemented yet.`,
				);

			case "success":
				logger.debug(`[1C Integration] Success: Exchange completed.`);
				return sendPlainTextResponse(res, 200, `success`);

			default:
				return sendPlainTextResponse(
					res,
					400,
					"failure\nInvalid mode parameter for GET request",
				);
		}
	}

	return sendPlainTextResponse(res, 400, "failure\nInvalid type parameter");
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
	const logger = req.scope.resolve("logger");
	const oneCSettingsService: OneCSettingsService =
		req.scope.resolve(ONE_C_MODULE);

	const settings = await oneCSettingsService.getSettings();

	const { type, mode, filename } = req.query as {
		type?: string;
		mode?: string;
		filename?: string;
	};

	if (!isAuthValid(req)) {
		logger.debug(
			"[1C Integration] File Upload (POST): Authentication failed (1C session cookie missing or invalid).",
		);
		return sendPlainTextResponse(
			res,
			401,
			"failure\nAuthentication failed for file upload",
		);
	}

	if (type !== "catalog" || mode !== "file") {
		return sendPlainTextResponse(
			res,
			400,
			"failure\nInvalid parameters for POST request",
		);
	}

	if (!filename) {
		return sendPlainTextResponse(
			res,
			400,
			"failure\nFilename not provided for file upload",
		);
	}

	logger.debug(`[1C Integration] File Upload: Receiving file: ${filename}`);

	if (!req.body || req.body === 0) {
		logger.debug(
			`[1C Integration] File Upload: No file content (req.body is empty or invalid) for ${filename}. Content-Type: ${req.headers["content-type"]}`,
		);
		return sendPlainTextResponse(
			res,
			400,
			`failure\nNo file content received for ${filename}.`,
		);
	}

	const contentLength = req.headers["content-length"];
	logger.debug(
		`[1C Integration] File Upload: Received Content-Length: ${contentLength}. Actual body type: ${typeof req.body}, isBuffer: ${Buffer.isBuffer(req.body)}`,
	);

	let xmlBuffer = req.body as Buffer;

	if (settings?.useZip) {
		logger.debug(
			`[1C Integration] File Upload: Decompressing zip file ${filename}.`,
		);
		try {
			xmlBuffer = zlib.gunzipSync(xmlBuffer);
		} catch (error) {
			logger.error(
				`[1C Integration] File Upload: Failed to decompress zip file ${filename}: ${error}`,
			);
			return sendPlainTextResponse(
				res,
				500,
				`failure\nFailed to decompress file ${filename}.`,
			);
		}
	}

	try {
		const { result, errors } = await onecExchangeWorkflow(req.scope).run({
			input: { xmlBuffer: xmlBuffer },
			throwOnError: false,
		});

		if (errors.length > 0) {
			logger.error(
				`[1C Integration] File Upload: Errors occurred during workflow execution for ${filename}: ${JSON.stringify(errors)}`,
			);
			return sendPlainTextResponse(
				res,
				500,
				`failure\nErrors occurred during file upload for ${filename}: ${errors.join(", ")}`,
			);
		}

		logger.debug(JSON.stringify(result));

		return sendPlainTextResponse(res, 200, "success");
	} catch (error) {
		logger.debug(
			`[1C Integration] File upload error for ${filename} in route: ${error}`,
		);
		const errorMessage =
			error instanceof MedusaError
				? error.message
				: error instanceof Error
					? error.message
					: "Unknown file upload error";
		return sendPlainTextResponse(res, 500, `failure\n${errorMessage}`);
	}
}

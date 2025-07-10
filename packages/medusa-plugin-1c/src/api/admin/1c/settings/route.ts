import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
	const oneCService = req.scope.resolve("oneC");

	// @ts-ignore
	const [settings, count] = await oneCService.listAndCountOneCSettings();

	if (count > 0) {
		res.json(settings[0]);
	} else {
		res.json();
	}
}

export const PUT = async (req: MedusaRequest, res: MedusaResponse) => {
	const oneCService = req.scope.resolve("oneC");
	// @ts-ignore
	const [settings, count] = await oneCService.listAndCountOneCSettings();
	let post: unknown;
	if (count > 0) {
		// @ts-ignore
		post = await oneCService.updateOneCSettings(req.body);
	} else {
		// @ts-ignore
		post = await oneCService.createOneCSettings(req.body);
	}
	res.json(post);
};

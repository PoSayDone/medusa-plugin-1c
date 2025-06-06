import {
	createStep,
	createWorkflow,
	StepResponse,
	WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { CommerceMlImportParser } from "commerceml-parser";
import { Classifier, Product, ClassifierGroup } from "commerceml-parser-core";
import { Readable } from "stream";

type ParseProductsStepInput = {
	xmlBuffer: Buffer;
};

const parseProductsStep = createStep(
	"parse-products",
	async ({ xmlBuffer }: ParseProductsStepInput) => {
		const buffer = Buffer.from((xmlBuffer as any).data);

		const catalogImportParser = new CommerceMlImportParser();

		const products: Product[] = [];
		const classifierGroups: ClassifierGroup[] = [];
		let classifier: Classifier;

		catalogImportParser.onClassifier((cl) => {
			classifier = cl;
		});

		catalogImportParser.onClassifierGroup((cg) => {
			classifierGroups.push(cg);
		});

		catalogImportParser.onProduct((p) => {
			products.push(p);
		});

		await catalogImportParser.parse(Readable.from([buffer]));

		return new StepResponse({
			// @ts-expect-error
			classifier,
			classifierGroups,
			products,
		});
	},
);

export const onecExchangeWorkflow = createWorkflow(
	"sync-from-erp",
	(input: ParseProductsStepInput) => {
		const res = parseProductsStep(input);

		// TODO: Implement products transform and uploading to db
		return new WorkflowResponse(res);
	},
);

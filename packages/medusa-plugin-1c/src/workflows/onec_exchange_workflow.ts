import { CreateProductWorkflowInputDTO } from "@medusajs/framework/types";
import {
	createStep,
	createWorkflow,
	StepResponse,
	transform,
	WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { createProductsWorkflow } from "@medusajs/medusa/core-flows";
import { CommerceMlImportParser } from "commerceml-parser";
import {
	Classifier,
	Product,
	ClassifierGroup,
	ClassifierProperty,
} from "commerceml-parser-core";
import slugify from "sluga";
import { Readable } from "stream";

type ParseProductsStepInput = {
	xmlBuffer: Buffer;
};

const parseProductsStep = createStep(
	"parse-products",
	async ({ xmlBuffer }: ParseProductsStepInput) => {
		const buffer = Buffer.from((xmlBuffer as any).data);

		const catalogImportParser = new CommerceMlImportParser();

		const properties: ClassifierProperty[] = [];
		const products: Product[] = [];
		const classifierGroups: ClassifierGroup[] = [];
		let classifier: Classifier;

		catalogImportParser.onClassifier((cl) => {
			classifier = cl;
		});

		catalogImportParser.onClassifierProperty((cp) => {
			properties.push(cp);
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
			properties,
			classifierGroups,
			products,
		});
	},
);

export const onecExchangeWorkflow = createWorkflow(
	"sync-from-erp",
	(input: ParseProductsStepInput) => {
		const onecData = parseProductsStep(input);

		const productsToCreate = transform(
			{
				onecData,
			},
			(data) => {
				return data.onecData.products.map((onecProduct) => {
					return {
						title: onecProduct.name,
						handle: slugify(onecProduct.name),
						external_id: onecProduct.id,
						options: [
							{
								title: "Default option",
								values: ["Default value"],
							},
						],
						variants: [
							{
								title: "Default variant",
								barcode: onecProduct.barcode,
								sku: onecProduct.article,
							},
						],
					} as CreateProductWorkflowInputDTO;
				});
			},
		);

		createProductsWorkflow.runAsStep({
			input: {
				products: productsToCreate,
			},
		});

		// TODO: Implement products transform and uploading to db
		return new WorkflowResponse(onecData);
	},
);

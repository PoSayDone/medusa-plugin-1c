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
import {
	parseDictionaryOptions,
	parseProductOptions,
} from "../utils/product-utils";

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
				const parsedOptions = parseDictionaryOptions(
					data.onecData.properties,
				);
				return data.onecData.products.map((onecProduct) => {
					const defaultOptions = [
						{
							title: "Default Option",
							values: ["Default value"],
						},
					];

					const [defaultAttributes, variantOptions, metadata] =
						parseProductOptions(
							onecProduct,
							data.onecData.properties,
						);

					return {
						title: onecProduct.name,
						description: onecProduct.description,
						handle: slugify(onecProduct.name),
						external_id: onecProduct.id,
						variants: [
							{
								title: "Default variant",
								barcode: onecProduct.barcode,
								sku: onecProduct.article,
								options: variantOptions,
							},
						],
						metadata: metadata,
						options:
							parsedOptions.length > 0
								? parsedOptions
								: defaultOptions,
						...defaultAttributes,
					} as CreateProductWorkflowInputDTO;
				});
			},
		);

		createProductsWorkflow.runAsStep({
			input: {
				products: productsToCreate,
			},
		});

		return new WorkflowResponse(onecData);
	},
);

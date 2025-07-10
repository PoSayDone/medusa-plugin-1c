import {
	CreateProductWorkflowInputDTO,
	UpdateProductWorkflowInputDTO,
} from "@medusajs/framework/types";
import {
	createStep,
	createWorkflow,
	StepResponse,
	transform,
	WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
	createProductsWorkflow,
	updateProductsWorkflow,
	useQueryGraphStep,
} from "@medusajs/medusa/core-flows";
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
import OneCSettingsService from "../modules/1c/service";
import { ONE_C_MODULE } from "../modules/1c";

type ParseProductsStepInput = {
	xmlBuffer: Buffer;
};

const parseProductsStep = createStep(
	"parse-products",
	async ({ xmlBuffer }: ParseProductsStepInput, { container }) => {
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

		const OneCSettingsService: OneCSettingsService =
			container.resolve(ONE_C_MODULE);

		const settings = await OneCSettingsService.getSettings();

		return new StepResponse({
			// @ts-expect-error
			classifier,
			properties,
			classifierGroups,
			products,
			settings,
		});
	},
);

export const onecExchangeWorkflow = createWorkflow(
	"sync-from-erp",
	(input: ParseProductsStepInput) => {
		const onecData = parseProductsStep(input);

		const { data: stores } = useQueryGraphStep({
			entity: "store",
			fields: ["default_sales_channel_id"],
		});

		// @ts-ignore
		const { data: shippingProfiles } = useQueryGraphStep({
			entity: "shipping_profile",
			fields: ["id"],
			pagination: {
				skip: 0,
				take: 1,
			},
		}).config({ name: "shipping-profile" });

		const externalIdsFilters = transform(
			{
				onecData,
			},
			(data) => {
				return data.onecData.products.map((product) => `${product.id}`);
			},
		);

		// @ts-ignore
		const { data: existingProducts } = useQueryGraphStep({
			entity: "product",
			fields: ["id", "external_id", "variants.*"],
			filters: {
				// @ts-ignore
				external_id: externalIdsFilters,
			},
		}).config({ name: "existing-products" });

		const { productsToCreate, productsToUpdate } = transform(
			{
				existingProducts,
				shippingProfiles,
				stores,
				onecData,
			},
			(data) => {
				const productsToCreate: CreateProductWorkflowInputDTO[] = [];
				const productsToUpdate: UpdateProductWorkflowInputDTO[] = [];

				const parsedOptions = parseDictionaryOptions(
					data.onecData.properties,
					data.onecData.settings?.attributes,
				);

				data.onecData.products.forEach((onecProduct) => {
					const defaultOptions = [
						{
							title: "Default",
							values: ["Default"],
						},
					];

					const [defaultAttributes, variantOptions, metadata] =
						parseProductOptions(
							onecProduct,
							data.onecData.properties,
							data.onecData.settings?.attributes,
						);

					const product:
						| CreateProductWorkflowInputDTO
						| UpdateProductWorkflowInputDTO = {
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
						...defaultAttributes,
					};

					const existingProduct = data.existingProducts.find(
						(p) => p.external_id === product.external_id,
					);
					if (existingProduct) {
						product.id = existingProduct.id;
					}

					if (existingProducts) {
						productsToUpdate.push(
							product as UpdateProductWorkflowInputDTO,
						);
					} else {
						productsToCreate.push(
							product as CreateProductWorkflowInputDTO,
						);
					}
				});

				return {
					productsToCreate,
					productsToUpdate,
				};
			},
		);

		createProductsWorkflow.runAsStep({
			input: {
				products: productsToCreate,
			},
		});

		updateProductsWorkflow.runAsStep({
			input: {
				products: productsToUpdate,
			},
		});

		return new WorkflowResponse({
			input,
		});
	},
);

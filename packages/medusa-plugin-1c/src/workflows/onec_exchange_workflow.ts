import {
	CreateProductCategoryDTO,
	CreateProductWorkflowInputDTO,
	IProductModuleService,
	ProductCategoryDTO,
	UpdateProductCategoryDTO,
	UpdateProductWorkflowInputDTO,
	UpsertProductCategoryDTO,
} from "@medusajs/framework/types";
import {
	createStep,
	createWorkflow,
	StepResponse,
	transform,
	WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
	createProductCategoriesStep,
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
	Catalog,
} from "commerceml-parser-core";
import slugify from "sluga";
import { createReadStream } from "fs";
import * as path from "path";
import {
	parseDictionaryOptions,
	parseProductOptions,
} from "../utils/product-utils";
import OneCSettingsService from "../modules/1c/service";
import { ONE_C_MODULE } from "../modules/1c";
import _ from "lodash";
import { Modules, promiseAll } from "@medusajs/framework/utils";

type WorkflowInput = {
	filePaths: string[];
};

export const parseFilesStep = createStep(
	"parse-files",
	async ({ filePaths }: WorkflowInput, { container }) => {
		const logger = container.resolve("logger");
		const catalogImportParser = new CommerceMlImportParser();

		const catalogs: Catalog[] = [];
		const properties: ClassifierProperty[] = [];
		const products: Product[] = [];
		const classifierGroups: ClassifierGroup[] = [];
		let classifier: Classifier | undefined;

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

		catalogImportParser.onCatalog((c) => {
			catalogs.push(c);
		});

		const importXmlPath = filePaths.find((p) =>
			path.basename(p).includes("import.xml"),
		);

		try {
			if (importXmlPath) {
				logger.info(
					`[1C Integration] Parsing import file: ${importXmlPath}`,
				);
				await catalogImportParser.parse(
					createReadStream(importXmlPath),
				);
				logger.info(`[1C Integration] Parsed data successfully.`);
			}
		} catch (e) {
			logger.error(
				`[1C Integration] Failed to parse files: ${e.message}`,
			);
			throw e;
		}

		const oneCSettingsService: OneCSettingsService =
			container.resolve(ONE_C_MODULE);

		const settings = await oneCSettingsService.getSettings();

		return new StepResponse({
			classifier,
			properties,
			classifierGroups,
			products,
			settings,
		});
	},
);

const updateCategoriesStep = createStep(
	"update-categories-step",
	async (
		data: { id: string; data: UpdateProductCategoryDTO }[],
		{ container },
	) => {
		const productModuleService = container.resolve(Modules.PRODUCT);
		const results: ProductCategoryDTO[] = [];

		await promiseAll(
			data.map(async ({ id, data }) => {
				const updated =
					await productModuleService.updateProductCategories(
						id,
						data,
					);
				results.push(updated);
			}),
		);

		return new StepResponse(results);
	},
);

export const onecExchangeWorkflow = createWorkflow(
	"sync-from-erp",
	(input: WorkflowInput) => {
		const onecData = parseFilesStep(input);

		const { data: stores } = useQueryGraphStep({
			entity: "store",
			fields: ["default_sales_channel_id"],
		}).config({ name: "stores" });

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

		const { data: existingProducts } = useQueryGraphStep({
			entity: "product",
			fields: ["id", "external_id", "variants.*"],
			filters: {
				external_id: externalIdsFilters,
			},
		}).config({ name: "existing-products" });

		const externalCatgoriesIdsFilters = transform(
			{
				onecData,
			},
			(data) => {
				return data.onecData.classifierGroups.map((cg) => `${cg.id}`);
			},
		);

		const { data: existingCategories } = useQueryGraphStep({
			entity: "product_category",
			fields: ["id", "metadata"],
			filters: {
				metadata: {
					onec_id: externalCatgoriesIdsFilters,
				},
			},
		}).config({ name: "existing-categories" });

		const { categoriesToCreate, categoriesToUpdate } = transform(
			{
				existingCategories,
				onecData,
			},
			(data) => {
				const categoriesToCreate: CreateProductCategoryDTO[] = [];
				const categoriesToUpdate: {
					id: string;
					data: UpdateProductCategoryDTO;
				}[] = [];

				data.onecData.classifierGroups.forEach((onecCategory) => {
					const category:
						| CreateProductCategoryDTO
						| UpdateProductCategoryDTO = {
						name: onecCategory.name,
						handle: slugify(onecCategory.name),
						metadata: {
							onec_id: onecCategory.id,
						},
					};

					const existingCategory = data.existingCategories.find(
						(p) =>
							p.metadata.onec_id === category.metadata?.onec_id,
					);

					if (existingCategory) {
						categoriesToUpdate.push({
							id: existingCategory.id,
							data: category as UpdateProductCategoryDTO,
						});
					} else {
						categoriesToCreate.push(
							category as CreateProductCategoryDTO,
						);
					}
				});

				return {
					categoriesToCreate,
					categoriesToUpdate,
				};
			},
		);
		createProductCategoriesStep({
			product_categories: categoriesToCreate,
		});

		updateCategoriesStep(categoriesToUpdate);

		const { productsToCreate, productsToUpdate } = transform(
			{
				existingCategories,
				existingProducts,
				shippingProfiles,
				stores,
				onecData,
			},
			(data) => {
				const productsToCreate: CreateProductWorkflowInputDTO[] = [];
				const productsToUpdate: UpdateProductWorkflowInputDTO[] = [];

				const defaultOptions = [
					{
						title: "Default",
						values: ["Default"],
					},
				];

				const parsedOptions = parseDictionaryOptions(
					data.onecData.properties,
					data.onecData.settings?.attributes,
				);

				data.onecData.products.forEach((onecProduct) => {
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
								options: _.isEmpty(variantOptions)
									? {
											Default: "Default",
										}
									: variantOptions,
							},
						],
						metadata,
						options:
							parsedOptions.length > 0
								? parsedOptions
								: defaultOptions,
						...defaultAttributes,
					};

					const existingProduct = data.existingProducts.find(
						(p) => p.external_id === product.external_id,
					);

					if (existingProduct) {
						product.id = existingProduct.id;
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

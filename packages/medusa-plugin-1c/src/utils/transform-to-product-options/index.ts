import { ClassifierProperty } from "commerceml-parser-core";
import { CreateProductOptionDTO } from "@medusajs/framework/types";

export default function transformToProductOptions(
	fields: ClassifierProperty[],
): CreateProductOptionDTO[] {
	return fields
		.filter(
			(field) =>
				field.type === "Справочник" &&
				Array.isArray(field.dictionaryValues),
		)
		.map(
			(field) =>
				({
					title: field.name,
					values: field.dictionaryValues!.map((v) => v.value),
				}) as CreateProductOptionDTO,
		);
}

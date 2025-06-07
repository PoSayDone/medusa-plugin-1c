import { CreateProductOptionDTO } from "@medusajs/framework/types";
import { Product, ClassifierProperty } from "commerceml-parser-core";

const DEFAULT_ATTRIBUTE_IDS = {
	height: "8cb50d27-260b-11e9-80c9-0cc47ab29cd1",
	width: "729246b8-260b-11e9-80c9-0cc47ab29cd1",
	length: "0ce59660-260b-11e9-80c9-0cc47ab29cd1",
	weight: "38409b0c-29da-11e9-80c9-0cc47ab29cd1",
	mid_code: "8d11c16f-1d64-11e9-80c9-0cc47ab29cd1",
	hs_code: "", // replace with real ID if exists
	origin_country: "3268183f-18fa-11e7-80c2-0cc47ab29cd1",
};

type DefaultAttributes = {
	height?: number | undefined;
	width?: number | undefined;
	length?: number | undefined;
	weight?: number | undefined;
	mid_code?: string | undefined;
	hs_code?: string | undefined;
	origin_country?: string | undefined;
};
type DictionaryValues = Record<string, string>;
type OtherOptions = Record<string, string>;

export function parseDictionaryOptions(
	options: ClassifierProperty[],
): CreateProductOptionDTO[] {
	return options
		.filter(
			(opt) =>
				opt.type === "Справочник" &&
				opt.dictionaryValues?.length &&
				!Object.values(DEFAULT_ATTRIBUTE_IDS).includes(opt.id),
		)
		.map((opt) => ({
			title: opt.name,
			values: opt.dictionaryValues!.map((dv) => dv.value),
		}));
}

export function parseProductOptions(
	product: Product,
	options: ClassifierProperty[],
): [DefaultAttributes, DictionaryValues, OtherOptions] {
	const optionMap = new Map<string, ClassifierProperty>();
	options.forEach((opt) => optionMap.set(opt.id, opt));

	const defaultAttrs: DefaultAttributes = {};
	const dictValues: DictionaryValues = {};
	const otherOptions: OtherOptions = {};

	for (const prop of product.propertyValues ?? []) {
		const option = optionMap.get(prop.id);
		if (!option) continue;

		const rawValue = prop.values?.[0];
		if (!rawValue) continue;

		const isDefault = Object.entries(DEFAULT_ATTRIBUTE_IDS).find(
			([, id]) => id === prop.id,
		);

		if (isDefault) {
			const key = isDefault[0] as keyof DefaultAttributes;

			if (option.type === "Число") {
				const numValue = parseFloat(rawValue.replace(",", "."));
				if (!isNaN(numValue)) defaultAttrs[key] = numValue;
			} else if (option.type === "Строка") {
				defaultAttrs[key] = rawValue;
			} else if (
				option.type === "Справочник" &&
				option.dictionaryValues
			) {
				const dictItem = option.dictionaryValues.find(
					(d) => d.id === rawValue,
				);
				if (dictItem) defaultAttrs[key] = dictItem.value;
			}

			continue;
		}

		if (option.type === "Справочник" && option.dictionaryValues) {
			const dictItem = option.dictionaryValues.find(
				(d) => d.id === rawValue,
			);
			if (dictItem) {
				dictValues[option.name] = dictItem.value;
				continue;
			}
		}

		// Fallback: treat as string option
		otherOptions[option.name] = rawValue;
	}

	return [defaultAttrs, dictValues, otherOptions];
}

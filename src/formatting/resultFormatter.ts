import * as math from 'mathjs';
import type { StringReplaceMap } from '../numerals.types';
import {
	getLocaleFormatter,
	texCurrencyReplacement,
} from '../rendering/displayUtils';
import { resultToTeX } from '../rendering/texRendering';
import type { CurrencyRegistry } from './currencyRegistry';
import {
	formatWithNumberFormatProfile,
	formatNumberWithProfile,
	resolveNumberFormatProfile,
} from './numberFormat';
import type {
	FormattedResult,
	NumberFormatProfile,
	ResultFormatOverrides,
	ResultFormatter,
} from './types';

export interface ResultFormatterConfig {
	profile: NumberFormatProfile;
	/** Wired in PR 1 so PR 2 can add policy without changing call sites. */
	currencies?: CurrencyRegistry;
	/** Legacy TeX conversion applies these source preprocessing rules. */
	preProcessors?: StringReplaceMap[];
}

/** Create the shared formatter used by block, inline, TeX, and insertion paths. */
export function createResultFormatter(
	config: ResultFormatterConfig
): ResultFormatter {
	return new DefaultResultFormatter(config);
}

class DefaultResultFormatter implements ResultFormatter {
	private readonly profile: NumberFormatProfile;
	private readonly preProcessors: StringReplaceMap[];

	constructor(config: ResultFormatterConfig) {
		this.profile = config.profile;
		this.preProcessors = [...(config.preProcessors ?? [])];
		// Retain the registry in the public construction contract for PR 2.
		// PR 1 intentionally applies no currency-special presentation policy.
		void config.currencies;
	}

	format(value: unknown, overrides?: ResultFormatOverrides): FormattedResult {
		const profile = resolveNumberFormatProfile(this.profile, overrides);
		const text = formatWithNumberFormatProfile(
			value,
			profile,
			overrides?.decimalPlaces
		);

		const tex = overrides?.decimalPlaces === undefined &&
			overrides?.numberFormat === undefined
			? legacyResultToTeX(value, this.preProcessors)
			: formatOverrideAsTeX(
				value,
				profile,
				overrides?.decimalPlaces,
				this.preProcessors
			);

		return {
			text,
			tex,
			// PR 1 preserves the result-insertion contract byte-for-byte.
			canonical: text,
		};
	}
}

function legacyResultToTeX(
	value: unknown,
	preProcessors: StringReplaceMap[]
): string {
	try {
		return resultToTeX(value, preProcessors);
	} catch {
		if (value === Number.POSITIVE_INFINITY) {
			return '\\infty';
		}
		if (value === Number.NEGATIVE_INFINITY) {
			return '-\\infty';
		}
		if (typeof value === 'number' && Number.isNaN(value)) {
			return '\\mathrm{NaN}';
		}
		return `\\text{${escapeTexText(math.format(value))}}`;
	}
}

function formatOverrideAsTeX(
	value: unknown,
	profile: NumberFormatProfile,
	decimalPlaces: number | undefined,
	preProcessors: StringReplaceMap[]
): string {
	if (typeof value === 'number') {
		return numberToTeX(value, profile, decimalPlaces);
	}
	if (math.isBigNumber(value)) {
		return bigNumberToTeX(value, profile, decimalPlaces);
	}
	if (math.isFraction(value)) {
		return numberToTeX(Number(value.valueOf()), profile, decimalPlaces);
	}

	if (math.isComplex(value)) {
		return complexToTeX(value, profile, decimalPlaces);
	}

	const collectionTex = collectionToTeX(
		value,
		profile,
		decimalPlaces,
		preProcessors
	);
	if (collectionTex !== undefined) {
		return collectionTex;
	}

	if (math.isUnit(value)) {
		try {
			const units = value.formatUnits();
			const numericValue = value.toNumeric(units);
			const numberTex = numericValueToTeX(
				numericValue,
				profile,
				decimalPlaces
			);
			let unitExpression = `1 ${units}`;
			unitExpression = applyPreProcessors(unitExpression, preProcessors);
			const unitTex = texCurrencyReplacement(
				math.parse(unitExpression).toTex()
			);
			return unitTex.replace(/1/u, () => numberTex);
		} catch {
			// Fall through to the generic result conversion.
		}
	}

	let processedResult = formatWithNumberFormatProfile(
		value,
		texProfile(profile),
		decimalPlaces
	);
	processedResult = applyPreProcessors(processedResult, preProcessors);

	try {
		return texCurrencyReplacement(math.parse(processedResult).toTex());
	} catch {
		// Keep the fallback value-driven and non-localized. Some uncommon
		// mathjs result types cannot be round-tripped through expression text.
		return resultToTeX(value, preProcessors);
	}
}

function numericValueToTeX(
	value: number | math.BigNumber | math.Fraction,
	profile: NumberFormatProfile,
	decimalPlaces: number | undefined
): string {
	if (math.isBigNumber(value)) {
		return bigNumberToTeX(value, profile, decimalPlaces);
	}
	if (math.isFraction(value)) {
		return numberToTeX(Number(value.valueOf()), profile, decimalPlaces);
	}
	return numberToTeX(value, profile, decimalPlaces);
}

function numberToTeX(
	value: number,
	profile: NumberFormatProfile,
	decimalPlaces: number | undefined
): string {
	const specialValue = specialNumberToTeX(value);
	if (specialValue !== undefined) {
		return specialValue;
	}

	return numberStringToTeX(formatNumberForTeX(value, profile, decimalPlaces));
}

function bigNumberToTeX(
	value: math.BigNumber,
	profile: NumberFormatProfile,
	decimalPlaces: number | undefined
): string {
	if (value.isNaN()) {
		return '\\mathrm{NaN}';
	}
	if (!value.isFinite()) {
		return `${value.isNegative() ? '-' : ''}\\infty`;
	}

	return numberStringToTeX(formatWithNumberFormatProfile(
		value,
		texProfile(profile),
		decimalPlaces
	));
}

function specialNumberToTeX(value: number): string | undefined {
	if (value === Number.POSITIVE_INFINITY) {
		return '\\infty';
	}
	if (value === Number.NEGATIVE_INFINITY) {
		return '-\\infty';
	}
	if (Number.isNaN(value)) {
		return '\\mathrm{NaN}';
	}

	return undefined;
}

function complexToTeX(
	value: math.Complex,
	profile: NumberFormatProfile,
	decimalPlaces: number | undefined
): string {
	const realTex = numberToTeX(value.re, profile, decimalPlaces);
	const imaginaryTex = numberToTeX(
		Math.abs(value.im),
		profile,
		decimalPlaces
	);

	if (value.im === 0) {
		return realTex;
	}
	if (value.re === 0) {
		return `${value.im < 0 ? '-' : ''}${imaginaryTex}~ i`;
	}

	return `${realTex} ${value.im < 0 ? '-' : '+'} ${imaginaryTex}~ i`;
}

function collectionToTeX(
	value: unknown,
	profile: NumberFormatProfile,
	decimalPlaces: number | undefined,
	preProcessors: StringReplaceMap[]
): string | undefined {
	let collection: unknown = value;
	if (math.isMatrix(value)) {
		collection = value.toArray();
	}
	if (!Array.isArray(collection)) {
		return undefined;
	}
	const collectionItems = collection as unknown[];
	if (collectionItems.length === 0) {
		return '\\begin{bmatrix}\\end{bmatrix}';
	}

	let rows: unknown[][];
	if (collectionItems.every((item) => !Array.isArray(item))) {
		rows = collectionItems.map((item) => [item]);
	} else if (isRegularMatrix(collectionItems)) {
		rows = collectionItems;
	} else {
		const renderedItems = collectionItems.map((item) =>
			formatOverrideAsTeX(item, profile, decimalPlaces, preProcessors)
		);
		return `\\left[${renderedItems.join(', ')}\\right]`;
	}

	const renderedRows = rows.map((row) => row.map((cell) =>
		formatOverrideAsTeX(cell, profile, decimalPlaces, preProcessors)
	).join('&'));

	return `\\begin{bmatrix}${renderedRows.join('\\\\')}\\end{bmatrix}`;
}

function isRegularMatrix(value: unknown[]): value is unknown[][] {
	if (!value.every(isFlatCollectionRow)) {
		return false;
	}

	const columnCount = value[0].length;
	return value.every((row) => row.length === columnCount);
}

function isFlatCollectionRow(value: unknown): value is unknown[] {
	return Array.isArray(value) &&
		(value as unknown[]).every((cell) => !Array.isArray(cell));
}

function applyPreProcessors(
	value: string,
	preProcessors: StringReplaceMap[]
): string {
	let processedResult = value;
	for (const processor of preProcessors) {
		processedResult = processedResult.replace(
			processor.regex,
			processor.replaceStr
		);
	}
	return processedResult;
}

function formatNumberForTeX(
	value: number,
	profile: NumberFormatProfile,
	decimalPlaces: number | undefined
): string {
	const profileForTeX = texProfile(profile);
	if (decimalPlaces !== undefined) {
		return formatNumberWithProfile(value, profileForTeX, decimalPlaces);
	}

	return math.format(value, profileForTeX.mathjsFormat);
}

function texProfile(profile: NumberFormatProfile): NumberFormatProfile {
	if (profile.notation !== 'standard') {
		return profile;
	}

	return {
		...profile,
		locale: 'en-US',
		useGrouping: false,
		mathjsFormat: getLocaleFormatter('en-US', { useGrouping: false }),
	};
}

function numberStringToTeX(value: string): string {
	const exponential = value.match(/^(.+)[eE]([+-]?\d+)$/u);
	if (!exponential) {
		return value;
	}

	return `${exponential[1]} \\times 10^{${Number(exponential[2])}}`;
}

function escapeTexText(value: string): string {
	return value
		.replace(/\\/gu, '\\textbackslash{}')
		.replace(/([{}#$%&_])/gu, '\\$1')
		.replace(/\^/gu, '\\textasciicircum{}')
		.replace(/~/gu, '\\textasciitilde{}');
}

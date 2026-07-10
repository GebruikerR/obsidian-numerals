import * as math from 'mathjs';
import { NumeralsNumberFormat } from '../numerals.types';
import { getLocaleFormatter } from '../rendering/displayUtils';
import type {
	NumberFormatProfile,
	ResultFormatOverrides,
} from './types';

const MIN_DECIMAL_PLACES = 0;
const MAX_DECIMAL_PLACES = 20;

/** Return whether a decimal-place value is supported by the formatter. */
export function isValidDecimalPlaces(value: number): boolean {
	return Number.isInteger(value) &&
		value >= MIN_DECIMAL_PLACES &&
		value <= MAX_DECIMAL_PLACES;
}

/**
 * Normalize a persisted number-format setting without discarding its locale.
 * The `mathjsFormat` field is exactly the formatter Numerals used before the
 * result-formatting architecture was introduced.
 */
export function createNumberFormatProfile(
	format: NumeralsNumberFormat,
	systemLocale?: string
): NumberFormatProfile {
	const resolvedSystemLocale = new Intl.NumberFormat(systemLocale)
		.resolvedOptions().locale;

	switch (format) {
		case NumeralsNumberFormat.System:
			return localeProfile(
				format,
				resolvedSystemLocale,
				resolvedSystemLocale,
				getLocaleFormatter(systemLocale)
			);
		case NumeralsNumberFormat.Fixed:
			return {
				id: format,
				systemLocale: resolvedSystemLocale,
				notation: 'fixed',
				useGrouping: false,
				mathjsFormat: { notation: 'fixed' },
			};
		case NumeralsNumberFormat.Exponential:
			return {
				id: format,
				systemLocale: resolvedSystemLocale,
				notation: 'exponential',
				useGrouping: false,
				mathjsFormat: { notation: 'exponential' },
			};
		case NumeralsNumberFormat.Engineering:
			return {
				id: format,
				systemLocale: resolvedSystemLocale,
				notation: 'engineering',
				useGrouping: false,
				mathjsFormat: { notation: 'engineering' },
			};
		case NumeralsNumberFormat.Format_CommaThousands_PeriodDecimal:
			return localeProfile(format, resolvedSystemLocale, 'en-US', getLocaleFormatter('en-US'));
		case NumeralsNumberFormat.Format_PeriodThousands_CommaDecimal:
			return localeProfile(format, resolvedSystemLocale, 'de-DE', getLocaleFormatter('de-DE'));
		case NumeralsNumberFormat.Format_SpaceThousands_CommaDecimal:
			return localeProfile(format, resolvedSystemLocale, 'fr-FR', getLocaleFormatter('fr-FR'));
		case NumeralsNumberFormat.Format_Indian:
			return localeProfile(format, resolvedSystemLocale, 'en-IN', getLocaleFormatter('en-IN'));
		default:
			return {
				id: NumeralsNumberFormat.Fixed,
				systemLocale: resolvedSystemLocale,
				notation: 'fixed',
				useGrouping: false,
				mathjsFormat: { notation: 'fixed' },
			};
	}
}

function localeProfile(
	id: NumeralsNumberFormat,
	systemLocale: string,
	locale: string | undefined,
	mathjsFormat: NumberFormatProfile['mathjsFormat']
): NumberFormatProfile {
	return {
		id,
		systemLocale,
		locale: new Intl.NumberFormat(locale).resolvedOptions().locale,
		notation: 'standard',
		useGrouping: true,
		mathjsFormat,
	};
}

/** Resolve an optional per-block number-format selection. */
export function resolveNumberFormatProfile(
	defaultProfile: NumberFormatProfile,
	overrides?: ResultFormatOverrides
): NumberFormatProfile {
	if (overrides?.numberFormat === undefined) {
		return defaultProfile;
	}

	return createNumberFormatProfile(
		overrides.numberFormat,
		defaultProfile.systemLocale
	);
}

/**
 * Format a mathjs result with a normalized profile.
 *
 * With no decimal override this delegates to the exact legacy formatter. An
 * explicit decimal override is a presentation policy only; it does not mutate
 * or round the evaluated value held in scope.
 */
export function formatWithNumberFormatProfile(
	value: unknown,
	profile: NumberFormatProfile,
	decimalPlaces?: number
): string {
	if (decimalPlaces === undefined || !isValidDecimalPlaces(decimalPlaces)) {
		return math.format(value, profile.mathjsFormat);
	}
	if (math.isFraction(value)) {
		return formatNumberWithProfile(Number(value.valueOf()), profile, decimalPlaces);
	}

	const numberFormatter = createOverrideNumberFormatter(profile, decimalPlaces);
	return math.format(value, numberFormatter);
}

/**
 * Format a single numeric value under an explicit override.
 * Exported so TeX and the currency layer can share the exact same rounding.
 */
export function formatNumberWithProfile(
	value: number,
	profile: NumberFormatProfile,
	decimalPlaces: number
): string {
	if (!isValidDecimalPlaces(decimalPlaces)) {
		return math.format(value, profile.mathjsFormat);
	}

	return createOverrideNumberFormatter(profile, decimalPlaces)(value);
}

function createOverrideNumberFormatter(
	profile: NumberFormatProfile,
	decimalPlaces: number
): (value: unknown) => string {
	return (value: unknown): string => {
		if (math.isBigNumber(value)) {
			return formatBigNumberWithProfile(value, profile, decimalPlaces);
		}
		if (math.isFraction(value)) {
			return formatNumberWithProfile(
				Number(value.valueOf()),
				profile,
				decimalPlaces
			);
		}
		if (typeof value !== 'number') {
			return math.format(value, {
				notation: profile.notation === 'standard' ? 'fixed' : profile.notation,
				precision: decimalPlaces,
			});
		}

		if (!Number.isFinite(value)) {
			return math.format(value);
		}

		switch (profile.notation) {
			case 'exponential':
				return formatExponential(value, decimalPlaces);
			case 'engineering':
				return formatEngineering(value, decimalPlaces);
			case 'fixed':
				return formatRoundedFixed(value, decimalPlaces);
			case 'standard':
			default:
				return new Intl.NumberFormat(profile.locale, {
					useGrouping: profile.useGrouping,
					minimumFractionDigits: decimalPlaces,
					maximumFractionDigits: decimalPlaces,
				}).format(value);
		}
	};
}

function formatExponential(value: number, decimalPlaces: number): string {
	if (value === 0) {
		return `${formatRoundedFixed(value, decimalPlaces)}e+0`;
	}

	let { coefficient, exponent } = decomposeNumber(value);
	let formattedCoefficient = formatRoundedFixed(coefficient, decimalPlaces);

	// Decimal rounding can promote 9.99 to 10.00; normalize the exponent.
	if (Math.abs(Number(formattedCoefficient)) >= 10) {
		exponent += 1;
		coefficient /= 10;
		formattedCoefficient = formatRoundedFixed(coefficient, decimalPlaces);
	}

	return `${formattedCoefficient}e${exponent >= 0 ? '+' : ''}${exponent}`;
}

function formatEngineering(value: number, decimalPlaces: number): string {
	if (value === 0) {
		return `${formatRoundedFixed(value, decimalPlaces)}e+0`;
	}

	const scientific = decomposeNumber(value);
	let exponent = Math.floor(scientific.exponent / 3) * 3;
	let coefficient = scientific.coefficient *
		Math.pow(10, scientific.exponent - exponent);
	let formattedCoefficient = formatRoundedFixed(coefficient, decimalPlaces);

	// Rounding can promote 999.99 to 1000.00; normalize it to the next group.
	if (Math.abs(Number(formattedCoefficient)) >= 1000) {
		exponent += 3;
		coefficient /= 1000;
		formattedCoefficient = formatRoundedFixed(coefficient, decimalPlaces);
	}

	return `${formattedCoefficient}e${exponent >= 0 ? '+' : ''}${exponent}`;
}

function formatRoundedFixed(value: number, decimalPlaces: number): string {
	return math.format(value, {
		notation: 'fixed',
		precision: decimalPlaces,
	});
}

function decomposeNumber(value: number): {
	coefficient: number;
	exponent: number;
} {
	const [coefficient, exponent] = value.toExponential().split('e');
	return {
		coefficient: Number(coefficient),
		exponent: Number(exponent),
	};
}

function formatBigNumberWithProfile(
	value: math.BigNumber,
	profile: NumberFormatProfile,
	decimalPlaces: number
): string {
	if (!value.isFinite()) {
		return math.format(value);
	}

	switch (profile.notation) {
		case 'exponential':
			return normalizeExponent(value.toExponential(decimalPlaces));
		case 'engineering':
			return formatBigNumberEngineering(value, decimalPlaces);
		case 'fixed':
			return value.toFixed(decimalPlaces);
		case 'standard':
		default:
			return localizeFixedDecimal(
				value.toFixed(decimalPlaces),
				profile.locale,
				profile.useGrouping
			);
	}
}

function formatBigNumberEngineering(
	value: math.BigNumber,
	decimalPlaces: number
): string {
	if (value.isZero()) {
		return `${value.toFixed(decimalPlaces)}e+0`;
	}

	const [coefficientText, exponentText] = value.toExponential().split('e');
	const scientificExponent = Number(exponentText);
	let exponent = Math.floor(scientificExponent / 3) * 3;
	let coefficient = math.bignumber(coefficientText).times(
		Math.pow(10, scientificExponent - exponent)
	);
	let formattedCoefficient = coefficient.toFixed(decimalPlaces);

	if (Math.abs(Number(formattedCoefficient)) >= 1000) {
		exponent += 3;
		coefficient = coefficient.dividedBy(1000);
		formattedCoefficient = coefficient.toFixed(decimalPlaces);
	}

	return `${formattedCoefficient}e${exponent >= 0 ? '+' : ''}${exponent}`;
}

function localizeFixedDecimal(
	value: string,
	locale: string | undefined,
	useGrouping: boolean
): string {
	const negative = value.startsWith('-');
	const unsignedValue = negative ? value.slice(1) : value;
	const [integer, fraction] = unsignedValue.split('.');
	const partsFormatter = new Intl.NumberFormat(locale, {
		useGrouping: true,
		maximumFractionDigits: 1,
	});
	const sampleParts = partsFormatter.formatToParts(123456789.1);
	const groupSeparator = sampleParts.find((part) => part.type === 'group')?.value ?? '';
	const decimalSeparator = sampleParts.find((part) => part.type === 'decimal')?.value ?? '.';
	const integerGroupLengths = sampleParts
		.filter((part) => part.type === 'integer')
		.map((part) => part.value.length);
	const primaryGroupSize = integerGroupLengths[integerGroupLengths.length - 1] ?? 3;
	const secondaryGroupSize = integerGroupLengths[integerGroupLengths.length - 2] ??
		primaryGroupSize;
	const minimumGroupedLength = findMinimumGroupedLength(locale);
	const groupedInteger = useGrouping
		? groupInteger(
			integer,
			groupSeparator,
			primaryGroupSize,
			secondaryGroupSize,
			minimumGroupedLength
		)
		: integer;
	const { prefix, suffix } = getSignAffixes(locale, negative);
	const localizedValue = `${prefix}${groupedInteger}${
		fraction === undefined ? '' : `${decimalSeparator}${fraction}`
	}${suffix}`;

	return localizeDigits(localizedValue, locale);
}

function groupInteger(
	integer: string,
	separator: string,
	primarySize: number,
	secondarySize: number,
	minimumGroupedLength: number
): string {
	if (integer.length < minimumGroupedLength || separator === '') {
		return integer;
	}

	const groups: string[] = [];
	let cursor = integer.length;
	let groupSize = primarySize;
	while (cursor > 0) {
		const start = Math.max(0, cursor - groupSize);
		groups.unshift(integer.slice(start, cursor));
		cursor = start;
		groupSize = secondarySize;
	}

	return groups.join(separator);
}

function findMinimumGroupedLength(locale: string | undefined): number {
	const formatter = new Intl.NumberFormat(locale, {
		useGrouping: true,
		maximumFractionDigits: 0,
	});
	for (let length = 4; length <= 15; length++) {
		const sample = Math.pow(10, length - 1);
		if (formatter.formatToParts(sample).some((part) => part.type === 'group')) {
			return length;
		}
	}

	return Number.POSITIVE_INFINITY;
}

function getSignAffixes(
	locale: string | undefined,
	negative: boolean
): { prefix: string; suffix: string } {
	if (!negative) {
		return { prefix: '', suffix: '' };
	}

	const parts = new Intl.NumberFormat(locale, {
		useGrouping: false,
		maximumFractionDigits: 0,
	}).formatToParts(-1);
	const integerIndex = parts.findIndex((part) => part.type === 'integer');
	return {
		prefix: parts.slice(0, integerIndex).map((part) => part.value).join(''),
		suffix: parts.slice(integerIndex + 1).map((part) => part.value).join(''),
	};
}

function localizeDigits(value: string, locale: string | undefined): string {
	const digitFormatter = new Intl.NumberFormat(locale, {
		useGrouping: false,
		maximumFractionDigits: 0,
	});
	const digits = Array.from({ length: 10 }, (_unused, digit) =>
		digitFormatter.format(digit)
	);

	return value.replace(/\d/gu, (digit) => digits[Number(digit)]);
}

function normalizeExponent(value: string): string {
	return value.replace(/e([+-]?)(\d+)$/u, (
		_match,
		sign: string,
		exponent: string
	) => `e${sign || '+'}${Number(exponent)}`);
}

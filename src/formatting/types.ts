import type * as math from 'mathjs';
import type {
	NumeralsNumberFormat,
	mathjsFormat,
} from '../numerals.types';

/** Per-block display policy parsed from Numerals formatting directives. */
export interface ResultFormatOverrides {
	/** Override the globally selected number format for this block. */
	numberFormat?: NumeralsNumberFormat;
	/** Render numeric components with exactly this many decimal places. */
	decimalPlaces?: number;
}

export interface ResultFormatContext {
	/** Source expression being rendered, used for display-only unit choices. */
	sourceExpression?: string;
}

/**
 * A normalized number-format selection.
 *
 * `mathjsFormat` preserves Numerals' existing formatter for the compatibility
 * path, while the remaining fields retain the locale and notation identity
 * needed to compose explicit decimal-place and currency policies.
 */
export interface NumberFormatProfile {
	/** The setting value from which this profile was created. */
	id: NumeralsNumberFormat;
	/** Resolved system locale, retained even when another profile is active. */
	systemLocale: string;
	/** Resolved BCP 47 locale for locale-backed formats. */
	locale?: string;
	/** Normalized notation used when an explicit display override is active. */
	notation: 'standard' | 'fixed' | 'exponential' | 'engineering';
	/** Whether locale-backed formatting groups thousands. */
	useGrouping: boolean;
	/** Existing mathjs-compatible format used when there is no override. */
	mathjsFormat: mathjsFormat;
}

/** All presentation forms of one evaluated result. */
export interface FormattedResult {
	/** Localized, user-facing output. Does not include a result separator. */
	text: string;
	/** MathJax-ready TeX source. */
	tex: string;
	/** Persistable output; currency symbols are normalized to active unit codes. */
	canonical: string;
}

/** The single formatting boundary used by every result-rendering surface. */
export interface ResultFormatter {
	format(
		value: unknown,
		overrides?: ResultFormatOverrides,
		context?: ResultFormatContext
	): FormattedResult;
}

/** Immutable metadata for one active currency unit. */
export interface CurrencyDefinition {
	code: string;
	symbol: string;
	texCommand: string;
	fractionDigits: number;
	unit: math.Unit;
}

/** A pure currency value matched against the active currency registry. */
export interface CurrencyMatch {
	definition: CurrencyDefinition;
	amount: number;
}

export const MIN_DECIMAL_PLACES = 0;
export const MAX_DECIMAL_PLACES = 20;

export type BlockNumberFormat =
	| 'system'
	| 'fixed'
	| 'exponential'
	| 'engineering'
	| 'comma-period'
	| 'period-comma'
	| 'space-comma'
	| 'indian';

export type FormatDirective =
	| { kind: 'format'; value: BlockNumberFormat }
	| { kind: 'decimalPlaces'; value: number };

export type InvalidFormatDirectiveReason =
	| 'missing-value'
	| 'unknown-format'
	| 'not-an-integer'
	| 'out-of-range';

export interface InvalidFormatDirective {
	kind: FormatDirective['kind'];
	lineIndex: number;
	source: string;
	value: string;
	reason: InvalidFormatDirectiveReason;
	message: string;
}

export type FormatDirectiveLineResult =
	| { status: 'not-directive' }
	| {
		status: 'valid';
		lineIndex: number;
		source: string;
		directive: FormatDirective;
	}
	| {
		status: 'invalid';
		error: InvalidFormatDirective;
	};

export interface CollectedFormatDirectives {
	format?: BlockNumberFormat;
	decimalPlaces?: number;
	/** Zero-based source indexes for every recognized format directive. */
	directiveLineIndexes: number[];
	/** Zero-based source indexes for valid directives only. */
	validDirectiveLineIndexes: number[];
	invalidDirectives: InvalidFormatDirective[];
	/**
	 * Source with every recognized format directive replaced by an empty row.
	 * The row count and original LF/CRLF line-ending style are preserved.
	 */
	sourceWithoutDirectives: string;
}

const formatAliases: Readonly<Record<string, BlockNumberFormat>> = {
	system: 'system',
	fixed: 'fixed',
	exponential: 'exponential',
	scientific: 'exponential',
	engineering: 'engineering',
	'comma-period': 'comma-period',
	'period-comma': 'period-comma',
	'space-comma': 'space-comma',
	indian: 'indian',
};

const directiveLineRegex = /^[\t ]*@(format|decimalPlaces?)(?=$|[\t \r])([\s\S]*?)[\t ]*\r?$/i;

function invalidDirective(
	kind: FormatDirective['kind'],
	lineIndex: number,
	source: string,
	value: string,
	reason: InvalidFormatDirectiveReason,
	message: string,
): FormatDirectiveLineResult {
	return {
		status: 'invalid',
		error: { kind, lineIndex, source, value, reason, message },
	};
}

/**
 * Parses one source row as a block formatting directive.
 *
 * Only complete-line directives are recognized. `scientific` is accepted as
 * an alias and normalized to the canonical `exponential` format.
 */
export function parseFormatDirectiveLine(
	source: string,
	lineIndex: number,
): FormatDirectiveLineResult {
	const match = source.match(directiveLineRegex);
	if (!match) {
		return { status: 'not-directive' };
	}

	const command = match[1].toLowerCase();
	const value = match[2].trim();
	if (command === 'format') {
		if (value.length === 0) {
			return invalidDirective(
				'format',
				lineIndex,
				source,
				value,
				'missing-value',
				'Missing @format value.',
			);
		}

		const format = formatAliases[value.toLowerCase()];
		if (!format) {
			return invalidDirective(
				'format',
				lineIndex,
				source,
				value,
				'unknown-format',
				`Unknown @format value: ${value}.`,
			);
		}

		return {
			status: 'valid',
			lineIndex,
			source,
			directive: { kind: 'format', value: format },
		};
	}

	if (value.length === 0) {
		return invalidDirective(
			'decimalPlaces',
			lineIndex,
			source,
			value,
			'missing-value',
			`Missing @decimalPlaces value; expected an integer from ${MIN_DECIMAL_PLACES} to ${MAX_DECIMAL_PLACES}.`,
		);
	}

	if (!/^\d+$/.test(value)) {
		return invalidDirective(
			'decimalPlaces',
			lineIndex,
			source,
			value,
			'not-an-integer',
			`Invalid @decimalPlaces value: ${value}; expected an integer from ${MIN_DECIMAL_PLACES} to ${MAX_DECIMAL_PLACES}.`,
		);
	}

	const decimalPlaces = Number(value);
	if (decimalPlaces < MIN_DECIMAL_PLACES || decimalPlaces > MAX_DECIMAL_PLACES) {
		return invalidDirective(
			'decimalPlaces',
			lineIndex,
			source,
			value,
			'out-of-range',
			`Invalid @decimalPlaces value: ${value}; expected an integer from ${MIN_DECIMAL_PLACES} to ${MAX_DECIMAL_PLACES}.`,
		);
	}

	return {
		status: 'valid',
		lineIndex,
		source,
		directive: { kind: 'decimalPlaces', value: decimalPlaces },
	};
}

/**
 * Collects block formatting directives without changing source row indexes.
 * When a directive occurs more than once, the last valid value wins.
 */
export function collectFormatDirectives(source: string): CollectedFormatDirectives {
	const rows = source.split('\n');
	const directiveLineIndexes: number[] = [];
	const validDirectiveLineIndexes: number[] = [];
	const invalidDirectives: InvalidFormatDirective[] = [];
	let format: BlockNumberFormat | undefined;
	let decimalPlaces: number | undefined;

	const sourceRows = rows.map((row, lineIndex) => {
		const result = parseFormatDirectiveLine(row, lineIndex);
		if (result.status === 'not-directive') {
			return row;
		}

		directiveLineIndexes.push(lineIndex);
		if (result.status === 'invalid') {
			invalidDirectives.push(result.error);
		} else {
			validDirectiveLineIndexes.push(lineIndex);
			if (result.directive.kind === 'format') {
				format = result.directive.value;
			} else {
				decimalPlaces = result.directive.value;
			}
		}

		// Keep the original line ending while removing the directive content.
		return row.endsWith('\r') ? '\r' : '';
	});

	return {
		format,
		decimalPlaces,
		directiveLineIndexes,
		validDirectiveLineIndexes,
		invalidDirectives,
		sourceWithoutDirectives: sourceRows.join('\n'),
	};
}

jest.mock('obsidian', () => ({
	finishRenderMath: jest.fn().mockResolvedValue(undefined),
	renderMath: jest.fn(),
	sanitizeHTMLToDom: jest.fn(),
}));

import * as math from 'mathjs';
import { NumeralsNumberFormat } from '../src/numerals.types';
import {
	createNumberFormatProfile,
	createResultFormatter,
} from '../src/formatting';
import { resultToTeX } from '../src/rendering/texRendering';

describe('ResultFormatter', () => {
	it('preserves the legacy text, TeX, and canonical contracts by default', () => {
		const profile = createNumberFormatProfile(
			NumeralsNumberFormat.Format_CommaThousands_PeriodDecimal,
			'en-US'
		);
		const formatter = createResultFormatter({ profile, preProcessors: [] });
		const value = 1234.5;

		const formatted = formatter.format(value);

		expect(formatted.text).toBe(math.format(value, profile.mathjsFormat));
		expect(formatted.tex).toBe(resultToTeX(value, []));
		expect(formatted.canonical).toBe(formatted.text);
	});

	it('formats localized text but raw-value TeX for an exact decimal override', () => {
		const profile = createNumberFormatProfile(
			NumeralsNumberFormat.Format_PeriodThousands_CommaDecimal,
			'en-US'
		);
		const formatter = createResultFormatter({ profile });

		const formatted = formatter.format(1234.5, { decimalPlaces: 2 });

		expect(formatted.text).toBe('1.234,50');
		expect(formatted.tex).toBe('1234.50');
		expect(formatted.canonical).toBe('1.234,50');
	});

	it('applies number-format and decimal overrides together', () => {
		const profile = createNumberFormatProfile(
			NumeralsNumberFormat.System,
			'en-US'
		);
		const formatter = createResultFormatter({ profile });

		const exponential = formatter.format(1234.5, {
			numberFormat: NumeralsNumberFormat.Exponential,
			decimalPlaces: 2,
		});
		const engineering = formatter.format(123456, {
			numberFormat: NumeralsNumberFormat.Engineering,
			decimalPlaces: 2,
		});

		expect(exponential.text).toBe('1.23e+3');
		expect(exponential.tex).toBe('1.23 \\times 10^{3}');
		expect(engineering.text).toBe('123.46e+3');
		expect(engineering.tex).toBe('123.46 \\times 10^{3}');
	});

	it('preserves exact decimal digits in Unit text and TeX', () => {
		const profile = createNumberFormatProfile(
			NumeralsNumberFormat.Fixed,
			'en-US'
		);
		const formatter = createResultFormatter({ profile });
		const value = math.unit(2, 'm');

		const formatted = formatter.format(value, { decimalPlaces: 2 });

		expect(formatted.text).toBe('2.00 m');
		expect(formatted.tex).toBe('2.00~\\mathrm{m}');
		expect(formatted.canonical).toBe('2.00 m');
	});

	it('does not mutate or computationally round a raw Unit value', () => {
		const profile = createNumberFormatProfile(
			NumeralsNumberFormat.Fixed,
			'en-US'
		);
		const formatter = createResultFormatter({ profile });
		const value = math.unit(1 / 3, 'm');
		const beforeText = value.toString();
		const beforeNumber = value.toNumber('m');

		const formatted = formatter.format(value, { decimalPlaces: 2 });

		expect(formatted.text).toBe('0.33 m');
		expect(value.toString()).toBe(beforeText);
		expect(value.toNumber('m')).toBe(beforeNumber);
		expect(value.toNumber('m')).not.toBe(0.33);
	});

	it('preserves decimal padding in collection and complex TeX', () => {
		const profile = createNumberFormatProfile(
			NumeralsNumberFormat.Fixed,
			'en-US'
		);
		const formatter = createResultFormatter({ profile });

		const matrix = formatter.format(math.matrix([[1, 2], [3, 4]]), {
			decimalPlaces: 2,
		});
		const complex = formatter.format(math.complex(1, -2), {
			decimalPlaces: 2,
		});

		expect(matrix.text).toBe('[[1.00, 2.00], [3.00, 4.00]]');
		expect(matrix.tex).toBe(
			'\\begin{bmatrix}1.00&2.00\\\\3.00&4.00\\end{bmatrix}'
		);
		expect(complex.text).toBe('1.00 - 2.00i');
		expect(complex.tex).toBe('1.00 - 2.00~ i');
	});

	it.each([
		[Number.POSITIVE_INFINITY, '\\infty'],
		[Number.NEGATIVE_INFINITY, '-\\infty'],
		[Number.NaN, '\\mathrm{NaN}'],
	])('renders non-finite override value %s as TeX', (value, expected) => {
		const profile = createNumberFormatProfile(
			NumeralsNumberFormat.Fixed,
			'en-US'
		);
		const formatter = createResultFormatter({ profile });

		expect(formatter.format(value, { decimalPlaces: 2 }).tex).toBe(expected);
	});

	it('preserves exact TeX digits for BigNumber and Fraction values', () => {
		const profile = createNumberFormatProfile(
			NumeralsNumberFormat.Fixed,
			'en-US'
		);
		const formatter = createResultFormatter({ profile });

		expect(formatter.format(math.bignumber(2), { decimalPlaces: 2 }).tex)
			.toBe('2.00');
		expect(formatter.format(math.fraction(1, 2), { decimalPlaces: 2 }).tex)
			.toBe('0.50');
		expect(formatter.format(math.bignumber(Number.NaN), {
			decimalPlaces: 2,
		}).tex).toBe('\\mathrm{NaN}');
	});

	it('preserves decimal padding in ragged and nested collection TeX', () => {
		const profile = createNumberFormatProfile(
			NumeralsNumberFormat.Fixed,
			'en-US'
		);
		const formatter = createResultFormatter({ profile });
		const value = [[[1], [2]], [[3, 4]]];

		const formatted = formatter.format(value, { decimalPlaces: 2 });

		expect(formatted.tex).toContain('1.00');
		expect(formatted.tex).toContain('2.00');
		expect(formatted.tex).toContain('3.00');
		expect(formatted.tex).toContain('4.00');
	});
});

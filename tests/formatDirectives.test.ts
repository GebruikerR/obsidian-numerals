import {
	collectFormatDirectives,
	parseFormatDirectiveLine,
} from '../src/processing/formatDirectives';

describe('format directives', () => {
	describe('parseFormatDirectiveLine', () => {
		it.each([
			['system', 'system'],
			['fixed', 'fixed'],
			['exponential', 'exponential'],
			['scientific', 'exponential'],
			['engineering', 'engineering'],
			['comma-period', 'comma-period'],
			['period-comma', 'period-comma'],
			['space-comma', 'space-comma'],
			['indian', 'indian'],
		])('accepts @format %s and normalizes it to %s', (input, expected) => {
			const result = parseFormatDirectiveLine(`@format ${input}`, 4);

			expect(result).toEqual({
				status: 'valid',
				lineIndex: 4,
				source: `@format ${input}`,
				directive: { kind: 'format', value: expected },
			});
		});

		it('is case-insensitive and permits surrounding whitespace', () => {
			const result = parseFormatDirectiveLine('  \t@FoRmAt CoMmA-PeRiOd  ', 0);

			expect(result).toMatchObject({
				status: 'valid',
				directive: { kind: 'format', value: 'comma-period' },
			});
		});

		it.each([
			['@decimalPlaces 0', 0],
			['@decimalPlace 2', 2],
			['@DECIMALPLACES 20', 20],
		])('accepts the bounded decimal directive %s', (source, expected) => {
			const result = parseFormatDirectiveLine(source, 1);

			expect(result).toMatchObject({
				status: 'valid',
				directive: { kind: 'decimalPlaces', value: expected },
			});
		});

		it.each([
			['@format', 'format', 'missing-value'],
			['@format hexadecimal', 'format', 'unknown-format'],
			['@decimalPlaces', 'decimalPlaces', 'missing-value'],
			['@decimalPlaces -1', 'decimalPlaces', 'not-an-integer'],
			['@decimalPlaces 1.5', 'decimalPlaces', 'not-an-integer'],
			['@decimalPlaces two', 'decimalPlaces', 'not-an-integer'],
			['@decimalPlaces 21', 'decimalPlaces', 'out-of-range'],
		])('returns a structured error for %s', (source, kind, reason) => {
			const result = parseFormatDirectiveLine(source, 7);

			expect(result).toMatchObject({
				status: 'invalid',
				error: {
					kind,
					lineIndex: 7,
					source,
					reason,
				},
			});
		});

		it.each([
			'value = @format fixed',
			'@formatter fixed',
			'prefix @decimalPlaces 2',
		])('does not claim non-directive source: %s', (source) => {
			expect(parseFormatDirectiveLine(source, 0)).toEqual({ status: 'not-directive' });
		});
	});

	describe('collectFormatDirectives', () => {
		it('keeps source row indexes stable while removing directive rows', () => {
			const source = [
				'value = 1',
				'@format fixed',
				'value = 2',
				'@decimalPlaces 2',
				'value = 3',
			].join('\n');

			const result = collectFormatDirectives(source);

			expect(result.sourceWithoutDirectives).toBe('value = 1\n\nvalue = 2\n\nvalue = 3');
			expect(result.directiveLineIndexes).toEqual([1, 3]);
			expect(result.validDirectiveLineIndexes).toEqual([1, 3]);
			expect(result.invalidDirectives).toEqual([]);
			expect(result.format).toBe('fixed');
			expect(result.decimalPlaces).toBe(2);
		});

		it('uses the last valid directive of each kind', () => {
			const result = collectFormatDirectives([
				'@format system',
				'@decimalPlaces 2',
				'@format scientific',
				'@decimalPlace 4',
			].join('\n'));

			expect(result.format).toBe('exponential');
			expect(result.decimalPlaces).toBe(4);
		});

		it('retains the last valid value while collecting later invalid directives', () => {
			const result = collectFormatDirectives([
				'@format fixed',
				'@format unknown',
				'@decimalPlaces 3',
				'@decimalPlaces 99',
			].join('\n'));

			expect(result.format).toBe('fixed');
			expect(result.decimalPlaces).toBe(3);
			expect(result.directiveLineIndexes).toEqual([0, 1, 2, 3]);
			expect(result.validDirectiveLineIndexes).toEqual([0, 2]);
			expect(result.invalidDirectives.map(({ lineIndex, reason }) => ({ lineIndex, reason }))).toEqual([
				{ lineIndex: 1, reason: 'unknown-format' },
				{ lineIndex: 3, reason: 'out-of-range' },
			]);
			expect(result.sourceWithoutDirectives).toBe('\n\n\n');
		});

		it('leaves source without directives unchanged', () => {
			const source = 'a = 1\nb = a + 1';

			expect(collectFormatDirectives(source)).toEqual({
				format: undefined,
				decimalPlaces: undefined,
				directiveLineIndexes: [],
				validDirectiveLineIndexes: [],
				invalidDirectives: [],
				sourceWithoutDirectives: source,
			});
		});

		it('preserves CRLF line endings and row count', () => {
			const source = 'a = 1\r\n@format fixed\r\nb = 2\r\n';
			const result = collectFormatDirectives(source);

			expect(result.sourceWithoutDirectives).toBe('a = 1\r\n\r\nb = 2\r\n');
			expect(result.sourceWithoutDirectives.split('\n')).toHaveLength(source.split('\n').length);
		});
	});
});

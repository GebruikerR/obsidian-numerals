import {
	CurrencyDisplayMode,
	CurrencyPrecisionMode,
	DEFAULT_PREFERRED_DISPLAY_UNITS_BY_DIMENSION,
	DEFAULT_SETTINGS,
	MAX_CURRENCY_DECIMAL_PLACES,
	MIN_CURRENCY_DECIMAL_PLACES,
	normalizeCurrencyFormattingSettings,
	normalizeUnitDisplayPreferencesSettings,
} from '../src/numerals.types';

describe('currency formatting settings', () => {
	it('uses currency-standard precision and code display by default', () => {
		expect(DEFAULT_SETTINGS.currencyPrecisionMode).toBe(
			CurrencyPrecisionMode.CurrencyStandard
		);
		expect(DEFAULT_SETTINGS.currencyDisplayMode).toBe(CurrencyDisplayMode.Code);
		expect(DEFAULT_SETTINGS.customCurrencyDecimalPlaces).toBe(2);
		expect(DEFAULT_SETTINGS.enableCustomDisplayUnitPreferences).toBe(false);
		expect(DEFAULT_SETTINGS.preserveExplicitInputUnits).toBe(true);
		expect(DEFAULT_SETTINGS.preferredDisplayUnitsByDimension).toEqual(
			DEFAULT_PREFERRED_DISPLAY_UNITS_BY_DIMENSION
		);
		expect(DEFAULT_SETTINGS.blockedDisplayUnits).toEqual([]);
		expect(DEFAULT_SETTINGS.customDisplayUnitsByDimension).toEqual({});
	});

	it('does not rewrite an older settings object with missing properties', () => {
		const data: Record<string, unknown> = { numberFormat: 'System' };

		expect(normalizeCurrencyFormattingSettings(data)).toBe(false);
		expect(data).toEqual({ numberFormat: 'System' });
		expect({ ...DEFAULT_SETTINGS, ...data }.currencyPrecisionMode).toBe(
			CurrencyPrecisionMode.CurrencyStandard
		);
	});

	it('leaves valid persisted settings unchanged', () => {
		const data: Record<string, unknown> = {
			currencyPrecisionMode: CurrencyPrecisionMode.CurrencyStandard,
			currencyDisplayMode: CurrencyDisplayMode.Symbol,
			customCurrencyDecimalPlaces: 3,
		};

		expect(normalizeCurrencyFormattingSettings(data)).toBe(false);
		expect(data).toEqual({
			currencyPrecisionMode: CurrencyPrecisionMode.CurrencyStandard,
			currencyDisplayMode: CurrencyDisplayMode.Symbol,
			customCurrencyDecimalPlaces: 3,
		});
	});

	it.each([MIN_CURRENCY_DECIMAL_PLACES, MAX_CURRENCY_DECIMAL_PLACES])(
		'accepts the inclusive custom decimal-place boundary %i',
		(customCurrencyDecimalPlaces) => {
			const data: Record<string, unknown> = { customCurrencyDecimalPlaces };

			expect(normalizeCurrencyFormattingSettings(data)).toBe(false);
			expect(data['customCurrencyDecimalPlaces']).toBe(customCurrencyDecimalPlaces);
		}
	);

	it.each([-1, 21, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '2', null])(
		'repairs invalid custom decimal places %p',
		(customCurrencyDecimalPlaces) => {
			const data: Record<string, unknown> = { customCurrencyDecimalPlaces };

			expect(normalizeCurrencyFormattingSettings(data)).toBe(true);
			expect(data['customCurrencyDecimalPlaces']).toBe(2);
		}
	);

	it('repairs invalid modes without changing other properties', () => {
		const data: Record<string, unknown> = {
			currencyPrecisionMode: 'automatic',
			currencyDisplayMode: 'narrow-symbol',
			customCurrencyDecimalPlaces: 4,
			unrelated: true,
		};

		expect(normalizeCurrencyFormattingSettings(data)).toBe(true);
		expect(data).toEqual({
			currencyPrecisionMode: CurrencyPrecisionMode.CurrencyStandard,
			currencyDisplayMode: CurrencyDisplayMode.Code,
			customCurrencyDecimalPlaces: 4,
			unrelated: true,
		});
	});

	it('normalizes persisted unit display preferences lists', () => {
		const data: Record<string, unknown> = {
			enableCustomDisplayUnitPreferences: true,
			preserveExplicitInputUnits: false,
			preferredDisplayUnitsByDimension: {
				mass: [' kg ', 'g', 'KG', '', 'mg'],
			},
			blockedDisplayUnits: [' ft ', 'FT', '', 'in'],
			customDisplayUnitsByDimension: {
				length: [' yd', 'yd', 'mi '],
			},
		};

		expect(normalizeUnitDisplayPreferencesSettings(data)).toBe(true);
		expect(data).toEqual({
			enableCustomDisplayUnitPreferences: true,
			preserveExplicitInputUnits: false,
			preferredDisplayUnitsByDimension: {
				...DEFAULT_PREFERRED_DISPLAY_UNITS_BY_DIMENSION,
				mass: ['kg', 'g', 'mg'],
			},
			blockedDisplayUnits: ['ft', 'in'],
			customDisplayUnitsByDimension: {
				length: ['yd', 'mi'],
			},
		});
	});

	it('repairs invalid unit display preference payloads', () => {
		const data: Record<string, unknown> = {
			enableCustomDisplayUnitPreferences: 'yes',
			preserveExplicitInputUnits: 1,
			preferredDisplayUnitsByDimension: ['kg', 'g'],
			blockedDisplayUnits: [1, 2],
			customDisplayUnitsByDimension: 'length=km',
		};

		expect(normalizeUnitDisplayPreferencesSettings(data)).toBe(true);
		expect(data).toEqual({
			enableCustomDisplayUnitPreferences: false,
			preserveExplicitInputUnits: true,
			preferredDisplayUnitsByDimension: DEFAULT_PREFERRED_DISPLAY_UNITS_BY_DIMENSION,
			blockedDisplayUnits: [],
			customDisplayUnitsByDimension: {},
		});
	});
});

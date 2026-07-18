import * as math from 'mathjs';
import type { CurrencyType } from '../numerals.types';
import type {
	CurrencyDefinition,
	CurrencyMatch,
} from './types';

const DEFAULT_CURRENCY_FRACTION_DIGITS = 2;

export interface CurrencyRegistryOptions {
	locale?: string;
	fractionDigitsByCode?: ReadonlyMap<string, number>;
}

/**
 * Immutable view of the currency units active in Numerals.
 *
 * Unit creation remains a plugin lifecycle concern. The registry only captures
 * already-created units and classifies evaluated values through public mathjs
 * Unit APIs.
 */
export class CurrencyRegistry {
	private readonly definitionsByCode: ReadonlyMap<string, CurrencyDefinition>;
	readonly definitions: readonly CurrencyDefinition[];

	private constructor(definitions: CurrencyDefinition[]) {
		this.definitions = Object.freeze(definitions.map(definition => Object.freeze(definition)));
		this.definitionsByCode = new Map(
			this.definitions.map(definition => [definition.code, definition])
		);
	}

	static create(
		currencyMap: readonly CurrencyType[],
		options: CurrencyRegistryOptions = {}
	): CurrencyRegistry {
		const clonedEntries = currencyMap.map(entry => ({ ...entry }));
		const definitionsByCode = new Map<string, CurrencyDefinition>();

		for (const entry of clonedEntries) {
			const code = entry.currency.trim();
			if (code.length === 0) {
				continue;
			}

			let unit: math.Unit;
			try {
				unit = math.unit(code);
			} catch {
				// A malformed or not-yet-created custom unit is not active.
				continue;
			}

			const configuredDigits = options.fractionDigitsByCode?.get(code);
			const fractionDigits = configuredDigits ??
				getCurrencyFractionDigits(code, options.locale);

			definitionsByCode.set(code, {
				code,
				symbol: entry.symbol,
				texCommand: `\\${entry.name}`,
				fractionDigits,
				unit,
			});
		}

		return new CurrencyRegistry([...definitionsByCode.values()]);
	}

	get(code: string): CurrencyDefinition | undefined {
		return this.definitionsByCode.get(code);
	}

	/** Match a dimensionally pure currency result from the active registry. */
	match(value: unknown): CurrencyMatch | undefined {
		if (!math.isUnit(value)) {
			return undefined;
		}

		for (const definition of this.definitions) {
			if (!value.equalBase(definition.unit)) {
				continue;
			}

			try {
				return {
					definition,
					amount: value.toNumber(definition.code),
				};
			} catch {
				// A matching base should convert, but a bad custom definition must
				// not make result formatting fail for unrelated output.
				return undefined;
			}
		}

		return undefined;
	}
}

function getCurrencyFractionDigits(code: string, locale?: string): number {
	if (!/^[A-Za-z]{3}$/u.test(code)) {
		return DEFAULT_CURRENCY_FRACTION_DIGITS;
	}

	try {
		return new Intl.NumberFormat(locale, {
			style: 'currency',
			currency: code.toUpperCase(),
		}).resolvedOptions().maximumFractionDigits ??
			DEFAULT_CURRENCY_FRACTION_DIGITS;
	} catch {
		return DEFAULT_CURRENCY_FRACTION_DIGITS;
	}
}

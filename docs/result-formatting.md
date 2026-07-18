# Result formatting architecture

## Goals

Numerals evaluates expressions with mathjs and formats the resulting values for several independent output surfaces. Formatting must remain a display concern: it must never round or stringify values stored in calculation scope.

This architecture addresses three related requests:

- General display precision and block-local formatter selection (#75 and #140).
- Currency-aware precision, symbols, and derived currency values (#160).
- Consistent result presentation in blocks, inline Numerals, TeX, and result insertion.

The work is split into two stacked pull requests. PR 1 introduces the shared formatting boundary and block directives. PR 2 adds currency presentation policies.

## Formatting boundary

Every evaluated value is sent to one `ResultFormatter`:

```ts
interface ResultFormatter {
    format(value: unknown, overrides?: ResultFormatOverrides): FormattedResult;
}

interface FormattedResult {
    text: string;
    tex: string;
    canonical: string;
}
```

- `text` is localized user-facing output and does not include the configured result separator.
- `tex` is MathJax-ready TeX generated from the raw result or non-localized structured parts.
- `canonical` is the result-insertion form.

PR 1 deliberately keeps `canonical` equal to the legacy formatted text so introducing the architecture does not silently rewrite existing notes. A future canonical-output migration must be explicit and independently documented.

Evaluation returns raw mathjs values. Renderers and result insertion format them after evaluation. `@prev`, `@sum`, variables, and globals therefore retain full, unrounded values.

## Number format profiles

The existing setting is normalized into a `NumberFormatProfile`. A profile retains:

- The original `NumeralsNumberFormat` value.
- The resolved locale for system and locale-backed formats.
- Notation: standard, fixed, exponential, or engineering.
- Grouping policy.
- The existing mathjs callback/options used by the compatibility path.

Retaining locale identity is important. An opaque callback can format a number, but it cannot safely compose exact decimal places, currency minor units, localized digits, symbol placement, or TeX policy.

Without an explicit override, the formatter delegates to the existing mathjs formatter byte-for-byte. Existing blocks and inline expressions must not change merely because the shared architecture is installed.

## Block directives

### Decimal places

```text
@decimalPlaces 2
@decimalPlace 2
```

The singular form is an alias. The value must be an integer from 0 through 20. A valid directive applies to the complete block and is hidden from rendered input.

The directive controls display only:

```text
@decimalPlaces 2
x = 1 / 3
y = x * 3
```

`x` displays as `0.33`, but the value stored in `x` remains the full result of `1 / 3`, so `y` evaluates to `1`, not `0.99`.

### Number format

```text
@format system
@format fixed
@format exponential
@format scientific
@format engineering
@format comma-period
@format period-comma
@format space-comma
@format indian
```

`scientific` is an alias for `exponential`. The remaining names map directly to the choices in Numerals settings.

### Parsing rules

- Directive names and values are case-insensitive.
- Leading and trailing whitespace are allowed.
- The last valid directive of each kind wins.
- A valid directive is replaced by an empty source line and marked evaluation-transparent, so source indexes stay aligned without changing `@prev` or `@total` semantics.
- An invalid directive stops block evaluation and produces a dedicated formatting-directive error that identifies the source line.
- Formatting directives are block-scoped. Inline Numerals use global settings.

### Precedence

Formatting policy has one stable precedence order:

```text
@decimalPlaces override
    > automatic currency-standard decimal places
        > block @format profile
            > global number format
```

`@format` selects notation and locale. `@decimalPlaces` controls exact coefficient/numeric decimal places without silently changing exponential or engineering notation to fixed notation.

## Output surfaces

The same formatter result is consumed everywhere:

- Plain block results use `text`.
- Syntax-highlighted block results use `text`.
- TeX block results use `tex`.
- Inline Reading mode uses `text` or `tex`, based on its trigger.
- Inline Live Preview uses `text` or `tex`, based on its trigger.
- `@[name::result]` insertion uses `canonical`.

Inline evaluation itself does not format results. This keeps `@prev` and note-global values raw and prevents Live Preview and Reading mode from drifting apart.

## Currency registry

An immutable `CurrencyRegistry` is built from the active Numerals currency map after the plugin creates the corresponding mathjs units. It clones the settings-derived map and uses only public mathjs APIs:

- `math.isUnit`
- `math.unit`
- `Unit.equalBase`
- `Unit.toNumber`

It does not inspect `Unit.units`, `Unit.value`, `Unit.UNITS`, or other mathjs internals.

A result is pure currency when its dimensions equal one active currency unit. This recognizes derived expressions such as `remaining / 8` and dimensionally simplified currency results, while excluding compound values such as `GBP / hour`.

Mathjs cannot remove registered units. Rebuilding the immutable registry changes which units receive currency presentation, even though stale mathjs unit definitions may remain until Obsidian reloads.

## Currency presentation

Currency presentation uses two independent settings. Their persisted values are intentionally explicit:

- `currencyPrecisionMode`: `follow-number-format` or `currency-standard`.
- `currencyDisplayMode`: `code` or `symbol`.

Older settings files omit these keys and inherit the current defaults without being rewritten on load. Present but invalid values are repaired to the current defaults. The custom decimal-place value must be an integer from 0 through 20; invalid persisted values are repaired to 2.

### Currency decimal places

- `Use currency standard` is the default and uses ISO 4217 minor units obtained from `Intl.NumberFormat.resolvedOptions()`.
- `Use rendered number format` applies the general number-format behavior to currency values.

Examples of standard digits:

- GBP and USD: 2
- JPY: 0
- KWD: 3

Custom currencies default to 2 and expose a validated custom decimal-place setting from 0 through 20. The custom value is only relevant when currency-standard precision is active.

### Currency display

- `ISO code` remains the default, such as `12.50 GBP`.
- `Configured symbol` uses the symbol in Numerals' active currency map.

Symbol placement comes from `Intl.NumberFormat.formatToParts()`. The formatter replaces only the `currency` part with the configured symbol. This preserves locale order, spacing, digits, signs, and bidirectional marks without accepting Intl's choice of symbol. For example, a `$` mapping to CAD continues to display the configured `$`, not an automatically selected `CA$`.

### Currency precedence and scope

- An explicit `@decimalPlaces` value overrides the currency-standard digit count.
- Pure configured currencies receive currency policy.
- Compound currency rates retain the selected general number format.
- TeX uses the same rounding decision, with a period decimal and no locale grouping.
- Result insertion continues using an ISO/custom unit code, never a display symbol.

Currency-standard precision applies by default. Configured-symbol display remains opt-in; currency codes are displayed and inserted unless the user selects symbols for display.

Changing a currency presentation setting rebuilds the immutable registry and formatter immediately. The settings tab continues to use its imperative implementation so Numerals can retain its existing minimum Obsidian version.

## Rounding versus display formatting

`@decimalPlaces` changes presentation, not computation. When a calculation itself must be rounded, use mathjs' rounding functions.

For numbers:

```text
round(2.555, 2)
```

For a mathjs Unit, the unit-aware signature requires the target unit:

```text
round(amount, 2, GBP)
```

The two-argument Unit form is not supported by mathjs. Numerals should not override `round()` or add `toFixed()` to expression scope. `toFixed()` produces a string, which would mix display values into subsequent calculations and blur the computation/display boundary.

Conventional two-place rounding examples are:

```text
120      -> 120.00
120.1    -> 120.10
120.32   -> 120.32
120.35   -> 120.35
120.3499 -> 120.35
```

## Compatibility and migration policy

PR 1 requirements:

- Default `text`, `tex`, and `canonical` output matches current behavior.
- Existing settings JSON remains valid.
- No result is rounded in scope.
- No mathjs formatter or Unit internal is patched for presentation.
- Only explicit block directives change output.

Currency-policy requirements:

- Currency-standard precision and currency-code display are the defaults.
- Configured symbols are opt-in, and users can select rendered-number precision when desired.
- The settings tab stays on the imperative API because `minAppVersion` remains below Obsidian 1.13.0.
- Symbol/unit remapping retains the existing reload requirement where mathjs aliases cannot be removed safely.

## Acceptance matrix

The implementation must cover:

- All global number profiles with and without block overrides.
- Plain, syntax-highlighted, TeX, inline Reading mode, inline Live Preview, and result insertion.
- Preservation of raw values through assignments, `@prev`, `@sum`, and globals.
- GBP/USD, JPY, KWD, remapped `$`, and custom currencies.
- Scalar-derived currency and compound currency rates.
- Negative midpoint values such as `-1.255 GBP`.
- `en-US`, `fr-FR`, and `ar-EG`, including non-Latin digits and bidi parts.
- TeX/text agreement without reparsing localized display output.

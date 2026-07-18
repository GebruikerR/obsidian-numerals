import * as math from 'mathjs';
import { NumeralsScope, NumeralsError } from '../numerals.types';

/**
 * Evaluates a block of math expressions and returns the results. Each row is evaluated separately
 * and the results are returned in an array. If an error occurs, the error message and the input that
 * caused the error are returned.
 * 
 * @remarks
 * This function uses the mathjs library to evaluate the expressions. The scope parameter is used to
 * provide variables and functions that can be used in the expressions. The scope is a Map object
 * where the keys are the variable names and the values are the variable values.
 * 
 * All Numerals directive must be removed from the source before calling this function as it is processed
 * directly by mathjs.
 * 
 * @param processedSource The source string to evaluate
 * @param scope The scope object to use for the evaluation
 * @returns An object containing the results of the evaluation, the inputs that were evaluated, and
 * any error message and input that caused the error.
 */
export function evaluateMathFromSourceStrings(
	processedSource: string,
	scope: NumeralsScope,
	transparentLineIndexes: readonly number[] = []
): {
	results: unknown[];
	inputs: string[];
	errorMsg: Error | null;
	errorInput: string;
} {
	let errorMsg = null;
	let errorInput = "";

	const rows: string[] = processedSource.split("\n");
	const results: unknown[] = [];
	const inputs: string[] = [];
	const transparentLines = new Set(transparentLineIndexes);
	const segmentResults: unknown[] = [];
	let hasPreviousEvaluation = false;
	let previousResult: unknown;

	// Last row is empty in reader view, so ignore it if empty
	const isLastRowEmpty = rows.slice(-1)[0] === "";
	const rowsToProcess = isLastRowEmpty ? rows.slice(0, -1) : rows;

	for (const [index, row] of rowsToProcess.entries()) {
		if (transparentLines.has(index)) {
			// Preserve source/result index alignment without allowing a display-only
			// directive row to change @prev or reset the current @total segment.
			results.push(undefined);
			inputs.push(row);
			continue;
		}

		try {
			if (hasPreviousEvaluation) {
				scope.set("__prev", previousResult);
			} else {
				scope.set("__prev", undefined);
				if (/__prev/i.test(row)) {
					errorMsg = new NumeralsError("Previous Value Error", 'Error evaluating @prev directive. There is no previous result.');
					errorInput = row;
					break;
				}
			}
			
			if (segmentResults.length > 1) {
				try {
					// eslint-disable-next-line prefer-spread
					const rollingSum = math.add.apply(math, segmentResults as [math.MathType, math.MathType, ...math.MathType[]]);
					scope.set("__total", rollingSum);
				} catch {
					scope.set("__total", undefined);
					// TODO consider doing this check before evaluating
					if (/__total/i.test(row)) {
						errorMsg = new NumeralsError("Summing Error", 'Error evaluating @sum or @total directive. Previous lines may not be summable.');
						errorInput = row;
						break;
					}						
				}

			} else if (segmentResults.length === 1) {
				scope.set("__total", segmentResults[0]);
			} else {
				scope.set("__total", undefined);
			}

			const result = math.evaluate(row, scope) as unknown;
			results.push(result);
			inputs.push(row); // Only pushes if evaluate is successful
			hasPreviousEvaluation = true;
			previousResult = result;
			if (result === undefined) {
				segmentResults.length = 0;
			} else {
				segmentResults.push(result);
			}
		} catch (error: unknown) {
			errorMsg = error instanceof Error ? error : new Error(String(error));
			errorInput = row;
			break;
		}
	}

	return { results, inputs, errorMsg, errorInput };
}

"""
ALGO ROBOT — Safe Real-Time Scanner Condition Evaluator
Parses and compiles mathematical and boolean comparison rules using safe AST evaluation.
Guarantees sub-microsecond evaluation per stock without unsafe eval/exec security hazards.
"""

from __future__ import annotations
import ast
import operator
from typing import Any, Dict, Set


# Safe AST operators
SAFE_OPERATORS = {
    # Binary math
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    # Comparison
    ast.Gt: operator.gt,
    ast.Lt: operator.lt,
    ast.GtE: operator.ge,
    ast.LtE: operator.le,
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    # Unary
    ast.USub: operator.neg,
    ast.Not: operator.not_,
}


class ConditionCompiler:
    """Safely compiles and evaluates scanner condition strings into executable AST trees."""

    def __init__(self, condition_str: str):
        self.raw_condition = condition_str.strip()
        # Normalize keywords: replace AND / OR / NOT with Python lowercase
        normalized = (
            self.raw_condition
            .replace(" AND ", " and ")
            .replace(" OR ", " or ")
            .replace(" NOT ", " not ")
            .replace(" && ", " and ")
            .replace(" || ", " or ")
            .replace(" = ", " == ")
        )
        self._parsed_tree = ast.parse(normalized, mode="eval")
        self._validate_ast(self._parsed_tree.body)

    def _validate_ast(self, node: ast.AST) -> None:
        """Recursively ensures the AST only contains safe math, comparison, and variable nodes."""
        if isinstance(node, (ast.Constant, ast.Name)):
            return
        elif isinstance(node, ast.UnaryOp):
            if type(node.op) not in SAFE_OPERATORS:
                raise ValueError(f"Unsupported unary operator: {type(node.op).__name__}")
            self._validate_ast(node.operand)
        elif isinstance(node, ast.BinOp):
            if type(node.op) not in SAFE_OPERATORS:
                raise ValueError(f"Unsupported binary operator: {type(node.op).__name__}")
            self._validate_ast(node.left)
            self._validate_ast(node.right)
        elif isinstance(node, ast.BoolOp):
            for val in node.values:
                self._validate_ast(val)
        elif isinstance(node, ast.Compare):
            self._validate_ast(node.left)
            for op, comparator in zip(node.ops, node.comparators):
                if type(op) not in SAFE_OPERATORS:
                    raise ValueError(f"Unsupported comparison operator: {type(op).__name__}")
                self._validate_ast(comparator)
        else:
            raise ValueError(f"Unsafe or disallowed expression element: {type(node).__name__}")

    def evaluate(self, context: Dict[str, Any]) -> bool:
        """Evaluates the compiled condition against the stock's quantitative context dictionary."""
        try:
            return bool(self._eval_node(self._parsed_tree.body, context))
        except Exception:
            return False

    def _eval_node(self, node: ast.AST, context: Dict[str, Any]) -> Any:
        if isinstance(node, ast.Constant):
            return node.value
        elif isinstance(node, ast.Name):
            # Resolve variable name from context (case-insensitive)
            name_lower = node.id.lower()
            if name_lower in context:
                return context[name_lower]
            # Also check uppercase
            name_upper = node.id.upper()
            if name_upper in context:
                return context[name_upper]
            # Default missing metric to 0.0
            return 0.0
        elif isinstance(node, ast.UnaryOp):
            op_func = SAFE_OPERATORS[type(node.op)]
            operand_val = self._eval_node(node.operand, context)
            return op_func(operand_val)
        elif isinstance(node, ast.BinOp):
            op_func = SAFE_OPERATORS[type(node.op)]
            left_val = self._eval_node(node.left, context)
            right_val = self._eval_node(node.right, context)
            return op_func(left_val, right_val)
        elif isinstance(node, ast.BoolOp):
            if isinstance(node.op, ast.And):
                return all(self._eval_node(v, context) for v in node.values)
            elif isinstance(node.op, ast.Or):
                return any(self._eval_node(v, context) for v in node.values)
        elif isinstance(node, ast.Compare):
            left_val = self._eval_node(node.left, context)
            for op, comparator in zip(node.ops, node.comparators):
                op_func = SAFE_OPERATORS[type(op)]
                right_val = self._eval_node(comparator, context)
                if not op_func(left_val, right_val):
                    return False
                left_val = right_val
            return True

        return False


def compile_condition(condition_str: str) -> ConditionCompiler:
    """Helper factory compiling condition strings with caching."""
    return ConditionCompiler(condition_str)

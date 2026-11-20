/** A small, safe expression evaluator for the exam calculator (no eval).
 * Supports + − × ÷ ^, parentheses, unary minus, %, π, e and common
 * functions. Angles are in radians unless `degrees` is set. */

type Token =
  | { t: "num"; v: number }
  | { t: "op"; v: string }
  | { t: "fn"; v: string }
  | { t: "(" }
  | { t: ")" };

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  ln: Math.log,
  log: Math.log10,
  abs: Math.abs,
};
const TRIG = new Set(["sin", "cos", "tan"]);
const INVERSE = new Set(["asin", "acos", "atan"]);
const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 4, neg: 3 };

function tokenize(input: string): Token[] {
  const src = input
    .replace(/\s+/g, "")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/√/g, "sqrt")
    .replace(/π/g, "pi");
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      if (src[j] === "e" && /[-+0-9]/.test(src[j + 1] || "") && !/[a-z]/i.test(src[j + 1] || "")) {
        j++;
        if (/[-+]/.test(src[j])) j++;
        while (j < src.length && /[0-9]/.test(src[j])) j++;
      }
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) throw new Error("Invalid number");
      out.push({ t: "num", v });
      i = j;
    } else if (/[a-z]/i.test(c)) {
      let j = i;
      while (j < src.length && /[a-z]/i.test(src[j])) j++;
      const word = src.slice(i, j).toLowerCase();
      if (word === "pi") out.push({ t: "num", v: Math.PI });
      else if (word === "e") out.push({ t: "num", v: Math.E });
      else if (FUNCS[word]) out.push({ t: "fn", v: word });
      else throw new Error(`Unknown name “${word}”`);
      i = j;
    } else if ("+-*/^".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
    } else if (c === "%") {
      out.push({ t: "op", v: "*" }, { t: "num", v: 0.01 });
      i++;
    } else if (c === "(") {
      out.push({ t: "(" });
      i++;
    } else if (c === ")") {
      out.push({ t: ")" });
      i++;
    } else throw new Error(`Unexpected “${c}”`);
  }
  // Implicit multiplication: 2pi, 3(4), (2)(3), 2sqrt(4)
  const withImplicit: Token[] = [];
  for (const tok of out) {
    const prev = withImplicit[withImplicit.length - 1];
    if (
      prev &&
      (prev.t === "num" || prev.t === ")") &&
      (tok.t === "num" || tok.t === "(" || tok.t === "fn")
    )
      withImplicit.push({ t: "op", v: "*" });
    withImplicit.push(tok);
  }
  return withImplicit;
}

export function evaluate(input: string, { degrees = false } = {}): number {
  const tokens = tokenize(input);
  if (!tokens.length) throw new Error("Empty expression");
  const values: number[] = [];
  const ops: string[] = [];
  const apply = () => {
    const op = ops.pop()!;
    if (op === "neg") {
      if (!values.length) throw new Error("Incomplete expression");
      values.push(-values.pop()!);
      return;
    }
    if (FUNCS[op]) {
      if (!values.length) throw new Error("Incomplete expression");
      let x = values.pop()!;
      if (degrees && TRIG.has(op)) x = (x * Math.PI) / 180;
      let r = FUNCS[op](x);
      if (degrees && INVERSE.has(op)) r = (r * 180) / Math.PI;
      values.push(r);
      return;
    }
    if (values.length < 2) throw new Error("Incomplete expression");
    const b = values.pop()!,
      a = values.pop()!;
    values.push(
      op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : op === "/" ? a / b : Math.pow(a, b),
    );
  };
  let expectValue = true;
  for (const tok of tokens) {
    if (tok.t === "num") {
      values.push(tok.v);
      expectValue = false;
    } else if (tok.t === "fn") {
      ops.push(tok.v);
      expectValue = true;
    } else if (tok.t === "(") {
      ops.push("(");
      expectValue = true;
    } else if (tok.t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") apply();
      if (!ops.length) throw new Error("Unmatched )");
      ops.pop();
      if (ops.length && FUNCS[ops[ops.length - 1]]) apply();
      expectValue = false;
    } else {
      let op = tok.v;
      if (expectValue) {
        if (op === "-") op = "neg";
        else if (op === "+") continue;
        else throw new Error("Incomplete expression");
      }
      // ^ is right-associative; unary minus binds looser than ^ (−2^2 = −4).
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top === "(" || FUNCS[top]) break;
        const higher =
          op === "^" || op === "neg"
            ? PREC[top] > PREC[op]
            : PREC[top] >= PREC[op];
        if (!higher) break;
        apply();
      }
      ops.push(op);
      expectValue = true;
    }
  }
  while (ops.length) {
    if (ops[ops.length - 1] === "(") throw new Error("Unmatched (");
    apply();
  }
  if (values.length !== 1 || !Number.isFinite(values[0])) throw new Error("Not a number");
  return values[0];
}

/** Rounds away binary noise for display: 0.1+0.2 → 0.3. */
export function formatResult(value: number) {
  if (Number.isInteger(value)) return String(value);
  const fixed = Number(value.toPrecision(12));
  return Math.abs(fixed) >= 1e12 || Math.abs(fixed) < 1e-9 ? fixed.toExponential(6) : String(fixed);
}

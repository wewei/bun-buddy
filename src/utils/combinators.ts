// 函数式编程组合子
// 纯粹的数学组合子，不依赖特定类型

// ============ 基础组合子 ============

// $K 组合子 - 常量函数
// 数学定义: K a b = a
// 作用: 忽略第二个参数，返回第一个参数
export const $K = <A, B>(a: A) => (_b: B): A => a;

// $S 组合子 - 应用组合子
// 数学定义: S f g x = f x (g x)
// 作用: 将两个函数应用到同一个参数上
export const $S = <A, B, C>(f: (a: A) => (b: B) => C) => (g: (a: A) => B) => (a: A): C =>
  f(a)(g(a));

// $I 组合子 - 恒等函数
// 数学定义: I x = x
// 作用: 返回输入不变
export const $I = <A>(a: A): A => a;

// $B 组合子 - 函数组合
// 数学定义: B f g x = f (g x)
// 作用: 函数组合，等价于 Haskell 的 (.)
export const $B = <A, B, C>(f: (b: B) => C) => (g: (a: A) => B) => (a: A): C =>
  f(g(a));

// $C 组合子 - 翻转参数
// 数学定义: C f x y = f y x
// 作用: 翻转二元函数的参数顺序
export const $C = <A, B, C>(f: (a: A) => (b: B) => C) => (b: B) => (a: A): C =>
  f(a)(b);

// $W 组合子 - 复制参数
// 数学定义: W f x = f x x
// 作用: 将同一个参数传递给二元函数两次
export const $W = <A, B>(f: (a: A) => (a: A) => B) => (a: A): B =>
  f(a)(a);

// $D 组合子 - 分发组合子
// 数学定义: D f x y = f x y
// 作用: 将柯里化函数转换为二元函数
export const $D = <A, B, C>(f: (a: A) => (b: B) => C) => (a: A) => (b: B): C =>
  f(a)(b);

// $E 组合子 - 扩展组合子
// 数学定义: E f x y z = f x y z
// 作用: 将三元柯里化函数转换为三元函数
export const $E = <A, B, C, D>(f: (a: A) => (b: B) => (c: C) => D) => (a: A) => (b: B) => (c: C): D =>
  f(a)(b)(c);

// $Y 组合子 - 不动点组合子
// 数学定义: Y f = f (Y f)
// 作用: 找到函数 f 的不动点，用于递归
export const $Y = <A, B>(f: (x: (a: A) => B) => (a: A) => B): (a: A) => B => {
  const g = (a: A): B => f(g)(a);
  return g;
};
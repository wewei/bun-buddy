import { describe, test, expect } from 'bun:test';
import { $K, $S, $I, $B, $C, $W, $D, $E, $Y } from './combinators';

describe('基础组合子', () => {
  describe('$K 组合子 - 常量函数', () => {
    test('应该忽略第二个参数，返回第一个参数', () => {
      const k5 = $K(5);
      expect(k5(10)).toBe(5);
      expect(k5('any')).toBe(5);
      expect(k5(null)).toBe(5);
    });

    test('应该支持不同类型的第一个参数', () => {
      expect($K('hello')('world')).toBe('hello');
      expect($K({ x: 1 })({ y: 2 })).toEqual({ x: 1 });
      expect($K(true)(false)).toBe(true);
    });

    test('应该返回相同的引用对象', () => {
      const obj = { value: 42 };
      const k = $K(obj);
      expect(k('anything')).toBe(obj);
    });
  });

  describe('$I 组合子 - 恒等函数', () => {
    test('应该返回输入值本身', () => {
      expect($I(5)).toBe(5);
      expect($I('hello')).toBe('hello');
      expect($I(true)).toBe(true);
    });

    test('应该保持对象引用', () => {
      const obj = { x: 1, y: 2 };
      expect($I(obj)).toBe(obj);
    });

    test('应该处理各种类型', () => {
      expect($I(null)).toBe(null);
      expect($I(undefined)).toBe(undefined);
      expect($I([1, 2, 3])).toEqual([1, 2, 3]);
    });
  });

  describe('$S 组合子 - 应用组合子', () => {
    test('应该将两个函数应用到同一个参数', () => {
      const add = (x: number) => (y: number) => x + y;
      const double = (x: number) => x * 2;
      const result = $S(add)(double)(5);
      expect(result).toBe(15); // 5 + (5 * 2)
    });

    test('应该正确传递参数', () => {
      const concat = (a: string) => (b: string) => a + b;
      const upper = (s: string) => s.toUpperCase();
      const result = $S(concat)(upper)('hello');
      expect(result).toBe('helloHELLO');
    });

    test('应该支持复杂的函数组合', () => {
      const divide = (x: number) => (y: number) => x / y;
      const half = (x: number) => x / 2;
      const result = $S(divide)(half)(10);
      expect(result).toBe(2); // 10 / (10 / 2) = 10 / 5 = 2
    });
  });

  describe('$B 组合子 - 函数组合', () => {
    test('应该正确组合两个函数', () => {
      const addOne = (x: number) => x + 1;
      const double = (x: number) => x * 2;
      const composed = $B(addOne)(double);
      expect(composed(5)).toBe(11); // (5 * 2) + 1
    });

    test('应该按正确顺序执行函数', () => {
      const toString = (n: number) => n.toString();
      const parseNum = (s: string) => parseInt(s, 10);
      const identity = $B(toString)(parseNum);
      expect(identity('42')).toBe('42');
    });

    test('应该支持多次组合', () => {
      const f = (x: number) => x + 1;
      const g = (x: number) => x * 2;
      const h = (x: number) => x - 3;
      const composed = $B($B(f)(g))(h);
      expect(composed(5)).toBe(5); // ((5 - 3) * 2) + 1 = 5
    });
  });

  describe('$C 组合子 - 翻转参数', () => {
    test('应该翻转二元函数的参数顺序', () => {
      const subtract = (a: number) => (b: number) => a - b;
      const flipped = $C(subtract);
      expect(subtract(10)(3)).toBe(7);
      expect(flipped(3)(10)).toBe(7);
    });

    test('应该处理字符串操作', () => {
      const concat = (a: string) => (b: string) => a + b;
      const flipped = $C(concat);
      expect(concat('hello')('world')).toBe('helloworld');
      expect(flipped('world')('hello')).toBe('helloworld');
    });

    test('应该保持结果类型', () => {
      const divide = (a: number) => (b: number) => a / b;
      const flipped = $C(divide);
      expect(flipped(2)(10)).toBe(5); // 10 / 2
    });
  });

  describe('$W 组合子 - 复制参数', () => {
    test('应该将同一参数传递两次', () => {
      const add = (a: number) => (b: number) => a + b;
      const double = $W(add);
      expect(double(5)).toBe(10);
      expect(double(7)).toBe(14);
    });

    test('应该处理乘法', () => {
      const multiply = (a: number) => (b: number) => a * b;
      const square = $W(multiply);
      expect(square(3)).toBe(9);
      expect(square(5)).toBe(25);
    });

    test('应该处理字符串连接', () => {
      const concat = (a: string) => (b: string) => a + b;
      const duplicate = $W(concat);
      expect(duplicate('hello')).toBe('hellohello');
    });
  });

  describe('$D 组合子 - 分发组合子', () => {
    test('应该正确应用柯里化函数', () => {
      const add = (a: number) => (b: number) => a + b;
      const result = $D(add)(3)(4);
      expect(result).toBe(7);
    });

    test('应该与原函数行为一致', () => {
      const concat = (a: string) => (b: string) => a + b;
      expect($D(concat)('hello')('world')).toBe(concat('hello')('world'));
    });

    test('应该保持类型转换', () => {
      const power = (base: number) => (exp: number) => Math.pow(base, exp);
      expect($D(power)(2)(3)).toBe(8);
    });
  });

  describe('$E 组合子 - 扩展组合子', () => {
    test('应该正确应用三参数函数', () => {
      const add3 = (a: number) => (b: number) => (c: number) => a + b + c;
      const result = $E(add3)(1)(2)(3);
      expect(result).toBe(6);
    });

    test('应该处理字符串拼接', () => {
      const concat3 = (a: string) => (b: string) => (c: string) => a + b + c;
      const result = $E(concat3)('hello')(' ')('world');
      expect(result).toBe('hello world');
    });

    test('应该保持计算逻辑', () => {
      const calc = (a: number) => (b: number) => (c: number) => (a + b) * c;
      expect($E(calc)(2)(3)(4)).toBe(20);
    });
  });

  describe('$Y 组合子 - 不动点组合子', () => {
    test('应该实现递归阶乘', () => {
      const factorial = $Y<number, number>(f => n =>
        n <= 1 ? 1 : n * f(n - 1)
      );
      
      expect(factorial(0)).toBe(1);
      expect(factorial(1)).toBe(1);
      expect(factorial(5)).toBe(120);
      expect(factorial(6)).toBe(720);
    });

    test('应该实现递归斐波那契', () => {
      const fib = $Y<number, number>(f => n =>
        n <= 1 ? n : f(n - 1) + f(n - 2)
      );
      
      expect(fib(0)).toBe(0);
      expect(fib(1)).toBe(1);
      expect(fib(6)).toBe(8);
      expect(fib(10)).toBe(55);
    });

    test('应该实现递归求和', () => {
      const sumToN = $Y<number, number>(f => n =>
        n <= 0 ? 0 : n + f(n - 1)
      );
      
      expect(sumToN(0)).toBe(0);
      expect(sumToN(5)).toBe(15);
      expect(sumToN(10)).toBe(55);
    });

    test('应该处理数组递归', () => {
      const sumArray = $Y<number[], number>(f => arr =>
        arr.length === 0 ? 0 : arr[0]! + f(arr.slice(1))
      );
      
      expect(sumArray([])).toBe(0);
      expect(sumArray([1, 2, 3, 4])).toBe(10);
    });
  });

  describe('组合子组合使用', () => {
    test('$B 和 $K 组合', () => {
      const always5 = $K(5);
      const addOne = (x: number) => x + 1;
      const composed = $B(addOne)(always5);
      expect(composed('any')).toBe(6);
    });

    test('$S 和 $K 组合得到 $I', () => {
      // SKK = I (SKI 组合子演算的基本恒等式)
      const identity = $S($K)($K);
      expect(identity(42)).toBe(42);
      expect(identity('test')).toBe('test');
    });

    test('$C 和 $B 组合', () => {
      const subtract = (a: number) => (b: number) => a - b;
      const double = (x: number) => x * 2;
      const composed = $C($B(subtract)(double));
      expect(composed(5)(10)).toBe(15); // (10 * 2) - 5
    });
  });
});


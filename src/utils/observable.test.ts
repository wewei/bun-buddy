import { describe, test, expect, beforeEach, jest } from 'bun:test';
import type { Observable, Updatable, Invalidate } from './observable';
import {
  pureOb,
  joinOb,
  bindOb,
  mapOb,
  apOb,
  lift2Ob,
  lift3Ob,
  sequenceOb,
  traverseOb,
  filterOb,
  whenOb,
  unlessOb,
  zipOb,
  zipWithOb,
  catchOb,
  recoverOb,
  throttleOb,
  debounceOb,
  makeObservable,
  makeUpdatable,
} from './observable';

describe('Observable Monad 基础操作', () => {
  describe('pureOb - pure/return 操作', () => {
    test('应该创建包含给定值的 Observable', () => {
      const ob = pureOb(42);
      const noop = () => {};
      expect(ob.observe(noop)).toBe(42);
    });

    test('应该忽略 invalidate 回调', () => {
      const ob = pureOb('hello');
      let called = false;
      const invalidate = () => { called = true; };
      
      expect(ob.observe(invalidate)).toBe('hello');
      expect(called).toBe(false);
    });

    test('应该支持各种类型', () => {
      expect(pureOb(null).observe(() => {})).toBe(null);
      expect(pureOb({ x: 1 }).observe(() => {})).toEqual({ x: 1 });
      expect(pureOb([1, 2, 3]).observe(() => {})).toEqual([1, 2, 3]);
    });
  });

  describe('joinOb - join 操作', () => {
    test('应该展平嵌套的 Observable', () => {
      const inner = pureOb(42);
      const outer = pureOb(inner);
      const flattened = joinOb(outer);
      
      expect(flattened.observe(() => {})).toBe(42);
    });

    test('应该传递 invalidate 到内层', () => {
      let innerCalled = false;
      const inner: Observable<number> = {
        observe: (invalidate) => {
          innerCalled = true;
          return 10;
        }
      };
      const outer = pureOb(inner);
      const flattened = joinOb(outer);
      
      flattened.observe(() => {});
      expect(innerCalled).toBe(true);
    });
  });

  describe('bindOb - bind (>>=) 操作', () => {
    test('应该正确绑定 Observable', () => {
      const ob = pureOb(5);
      const bound = bindOb(ob, (x) => pureOb(x * 2));
      
      expect(bound.observe(() => {})).toBe(10);
    });

    test('应该支持链式绑定', () => {
      const ob = pureOb(3);
      const result = bindOb(
        bindOb(ob, (x) => pureOb(x + 1)),
        (x) => pureOb(x * 2)
      );
      
      expect(result.observe(() => {})).toBe(8); // (3 + 1) * 2
    });

    test('应该传递 invalidate', () => {
      let invalidateCalled = false;
      const ob: Observable<number> = {
        observe: (invalidate) => {
          invalidateCalled = true;
          return 5;
        }
      };
      
      const bound = bindOb(ob, (x) => pureOb(x * 2));
      bound.observe(() => {});
      
      expect(invalidateCalled).toBe(true);
    });
  });

  describe('mapOb - map (fmap) 操作', () => {
    test('应该转换 Observable 的值', () => {
      const ob = pureOb(5);
      const mapped = mapOb(ob, (x) => x * 2);
      
      expect(mapped.observe(() => {})).toBe(10);
    });

    test('应该支持类型转换', () => {
      const ob = pureOb(42);
      const mapped = mapOb(ob, (x) => x.toString());
      
      expect(mapped.observe(() => {})).toBe('42');
    });

    test('应该支持链式 map', () => {
      const ob = pureOb(3);
      const result = mapOb(mapOb(ob, x => x + 1), x => x * 2);
      
      expect(result.observe(() => {})).toBe(8);
    });
  });

  describe('apOb - ap 操作', () => {
    test('应该应用函数 Observable', () => {
      const fab = pureOb((x: number) => x * 2);
      const ob = pureOb(5);
      const result = apOb(fab, ob);
      
      expect(result.observe(() => {})).toBe(10);
    });

    test('应该处理复杂函数', () => {
      const fab = pureOb((x: string) => x.toUpperCase());
      const ob = pureOb('hello');
      const result = apOb(fab, ob);
      
      expect(result.observe(() => {})).toBe('HELLO');
    });
  });
});

describe('Observable 实用函数', () => {
  describe('lift2Ob - 提升二元函数', () => {
    test('应该组合两个 Observable', () => {
      const add = (a: number, b: number) => a + b;
      const ob1 = pureOb(3);
      const ob2 = pureOb(4);
      const result = lift2Ob(add)(ob1, ob2);
      
      expect(result.observe(() => {})).toBe(7);
    });

    test('应该支持不同类型', () => {
      const concat = (a: string, b: string) => a + b;
      const ob1 = pureOb('hello');
      const ob2 = pureOb('world');
      const result = lift2Ob(concat)(ob1, ob2);
      
      expect(result.observe(() => {})).toBe('helloworld');
    });
  });

  describe('lift3Ob - 提升三元函数', () => {
    test('应该组合三个 Observable', () => {
      const add3 = (a: number, b: number, c: number) => a + b + c;
      const ob1 = pureOb(1);
      const ob2 = pureOb(2);
      const ob3 = pureOb(3);
      const result = lift3Ob(add3)(ob1, ob2, ob3);
      
      expect(result.observe(() => {})).toBe(6);
    });
  });

  describe('sequenceOb - 序列操作', () => {
    test('应该将 Observable 数组转换为数组 Observable', () => {
      const observables = [pureOb(1), pureOb(2), pureOb(3)];
      const result = sequenceOb(observables);
      
      expect(result.observe(() => {})).toEqual([1, 2, 3]);
    });

    test('应该处理空数组', () => {
      const result = sequenceOb([]);
      expect(result.observe(() => {})).toEqual([]);
    });

    test('应该保持顺序', () => {
      const obs = [pureOb('a'), pureOb('b'), pureOb('c')];
      const result = sequenceOb(obs);
      
      expect(result.observe(() => {})).toEqual(['a', 'b', 'c']);
    });
  });

  describe('traverseOb - 遍历操作', () => {
    test('应该转换数组为 Observable', () => {
      const f = (x: number) => pureOb(x * 2);
      const result = traverseOb(f)([1, 2, 3]);
      
      expect(result.observe(() => {})).toEqual([2, 4, 6]);
    });

    test('应该处理空数组', () => {
      const f = (x: number) => pureOb(x * 2);
      const result = traverseOb(f)([]);
      
      expect(result.observe(() => {})).toEqual([]);
    });
  });

  describe('filterOb - 过滤操作', () => {
    test('应该保留满足条件的值', () => {
      const ob = pureOb(5);
      const filtered = filterOb(ob, (x) => x > 3);
      
      expect(filtered.observe(() => {})).toBe(5);
    });

    test('应该过滤不满足条件的值', () => {
      const ob = pureOb(2);
      const filtered = filterOb(ob, (x) => x > 3);
      
      expect(filtered.observe(() => {})).toBe(undefined);
    });
  });

  describe('whenOb - 条件执行', () => {
    test('条件为 true 时应该返回值', () => {
      const condition = pureOb(true);
      const ob = pureOb(42);
      const result = whenOb(condition, ob);
      
      expect(result.observe(() => {})).toBe(42);
    });

    test('条件为 false 时应该返回 undefined', () => {
      const condition = pureOb(false);
      const ob = pureOb(42);
      const result = whenOb(condition, ob);
      
      expect(result.observe(() => {})).toBe(undefined);
    });
  });

  describe('unlessOb - 反向条件执行', () => {
    test('条件为 false 时应该返回值', () => {
      const condition = pureOb(false);
      const ob = pureOb(42);
      const result = unlessOb(condition, ob);
      
      expect(result.observe(() => {})).toBe(42);
    });

    test('条件为 true 时应该返回 undefined', () => {
      const condition = pureOb(true);
      const ob = pureOb(42);
      const result = unlessOb(condition, ob);
      
      expect(result.observe(() => {})).toBe(undefined);
    });
  });

  describe('zipOb - 组合操作', () => {
    test('应该组合两个 Observable 为元组', () => {
      const ob1 = pureOb(1);
      const ob2 = pureOb('a');
      const result = zipOb(ob1, ob2);
      
      expect(result.observe(() => {})).toEqual([1, 'a']);
    });
  });

  describe('zipWithOb - 使用函数组合', () => {
    test('应该使用函数组合两个 Observable', () => {
      const add = (a: number, b: number) => a + b;
      const ob1 = pureOb(3);
      const ob2 = pureOb(4);
      const result = zipWithOb(add, ob1, ob2);
      
      expect(result.observe(() => {})).toBe(7);
    });
  });
});

describe('Observable 错误处理', () => {
  describe('catchOb - 错误捕获', () => {
    test('应该捕获错误并恢复', () => {
      const errorOb: Observable<number> = {
        observe: () => {
          throw new Error('Test error');
        }
      };
      
      const recovered = catchOb(errorOb, (_error) => pureOb(0));
      expect(recovered.observe(() => {})).toBe(0);
    });

    test('正常值不应触发错误处理', () => {
      const normalOb = pureOb(42);
      let handlerCalled = false;
      
      const result = catchOb(normalOb, () => {
        handlerCalled = true;
        return pureOb(0);
      });
      
      expect(result.observe(() => {})).toBe(42);
      expect(handlerCalled).toBe(false);
    });
  });

  describe('recoverOb - 错误恢复', () => {
    test('应该用默认值恢复错误', () => {
      const errorOb: Observable<number> = {
        observe: () => {
          throw new Error('Test error');
        }
      };
      
      const recovered = recoverOb(errorOb, 999);
      expect(recovered.observe(() => {})).toBe(999);
    });

    test('正常值不应被替换', () => {
      const normalOb = pureOb(42);
      const recovered = recoverOb(normalOb, 999);
      
      expect(recovered.observe(() => {})).toBe(42);
    });
  });
});

describe('Observable 时间控制', () => {
  describe('throttleOb - 节流', () => {
    test('应该限制调用频率', () => {
      let callCount = 0;
      const ob: Observable<number> = {
        observe: () => {
          callCount++;
          return callCount;
        }
      };
      
      const throttled = throttleOb(ob, 100);
      const noop = () => {};
      
      const val1 = throttled.observe(noop);
      const val2 = throttled.observe(noop);
      
      expect(val1).toBe(1);
      expect(val2).toBe(1); // 应该返回缓存值
      expect(callCount).toBe(1);
    });
  });

  describe('debounceOb - 防抖', () => {
    test('应该延迟调用 invalidate', () => {
      const ob = pureOb(42);
      const debounced = debounceOb(ob, 100);
      
      let invalidateCalled = false;
      const invalidate = () => { invalidateCalled = true; };
      
      const result = debounced.observe(invalidate);
      
      expect(result).toBe(42);
      expect(invalidateCalled).toBe(false);
    });
  });
});

describe('Observable 创建函数', () => {
  describe('makeObservable - 创建 Observable', () => {
    test('应该创建可响应的 Observable', () => {
      let setter: (value: number) => void;
      
      const ob = makeObservable<number>((set) => {
        setter = set;
        return 0;
      });
      
      let currentValue = ob.observe(() => {});
      expect(currentValue).toBe(0);
      
      setter!(42);
      currentValue = ob.observe(() => {});
      expect(currentValue).toBe(42);
    });

    test('应该在值更新时调用 invalidate', () => {
      let setter: (value: number) => void;
      let invalidateCalled = false;
      
      const ob = makeObservable<number>((set) => {
        setter = set;
        return 0;
      });
      
      const invalidate = () => { invalidateCalled = true; };
      ob.observe(invalidate);
      
      setter!(10);
      expect(invalidateCalled).toBe(true);
    });
  });

  describe('makeUpdatable - 创建可更新的 Observable', () => {
    test('应该创建带 update 方法的 Observable', () => {
      const updatable = makeUpdatable(0);
      
      expect(updatable.observe(() => {})).toBe(0);
      
      updatable.update(x => x + 1);
      expect(updatable.observe(() => {})).toBe(1);
      
      updatable.update(x => x * 2);
      expect(updatable.observe(() => {})).toBe(2);
    });

    test('update 应该返回新值', () => {
      const updatable = makeUpdatable(10);
      const newValue = updatable.update(x => x + 5);
      
      expect(newValue).toBe(15);
    });

    test('应该在更新时触发 invalidate', () => {
      const updatable = makeUpdatable(0);
      let invalidateCalled = false;
      
      const invalidate = () => { invalidateCalled = true; };
      updatable.observe(invalidate);
      
      updatable.update(x => x + 1);
      expect(invalidateCalled).toBe(true);
    });

    test('应该支持复杂的更新逻辑', () => {
      type Counter = { count: number; label: string };
      const updatable = makeUpdatable<Counter>({ count: 0, label: 'test' });
      
      updatable.update(state => ({
        ...state,
        count: state.count + 1
      }));
      
      expect(updatable.observe(() => {})).toEqual({ count: 1, label: 'test' });
    });
  });
});

describe('Observable Monad 法则', () => {
  describe('左单位元法则: return a >>= f ≡ f a', () => {
    test('应该满足左单位元法则', () => {
      const a = 42;
      const f = (x: number) => pureOb(x * 2);
      
      const left = bindOb(pureOb(a), f);
      const right = f(a);
      
      expect(left.observe(() => {})).toBe(right.observe(() => {}));
    });
  });

  describe('右单位元法则: m >>= return ≡ m', () => {
    test('应该满足右单位元法则', () => {
      const m = pureOb(42);
      const bound = bindOb(m, pureOb);
      
      expect(bound.observe(() => {})).toBe(m.observe(() => {}));
    });
  });

  describe('结合律: (m >>= f) >>= g ≡ m >>= (\\x -> f x >>= g)', () => {
    test('应该满足结合律', () => {
      const m = pureOb(5);
      const f = (x: number) => pureOb(x + 1);
      const g = (x: number) => pureOb(x * 2);
      
      const left = bindOb(bindOb(m, f), g);
      const right = bindOb(m, x => bindOb(f(x), g));
      
      expect(left.observe(() => {})).toBe(right.observe(() => {}));
    });
  });

  describe('Functor 法则', () => {
    test('fmap id ≡ id', () => {
      const ob = pureOb(42);
      const mapped = mapOb(ob, x => x);
      
      expect(mapped.observe(() => {})).toBe(ob.observe(() => {}));
    });

    test('fmap (f . g) ≡ fmap f . fmap g', () => {
      const ob = pureOb(5);
      const f = (x: number) => x + 1;
      const g = (x: number) => x * 2;
      
      const left = mapOb(ob, x => f(g(x)));
      const right = mapOb(mapOb(ob, g), f);
      
      expect(left.observe(() => {})).toBe(right.observe(() => {}));
    });
  });
});


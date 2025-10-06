// 函数式 Monadic Observable 类型定义

export type Invalidate = () => void;

export type Observable<T> = (invalidate: Invalidate) => T;

export type Updatable<T> = {
  observable: Observable<T>;
  update: (updater: (currentValue: T) => T) => void;
};

// 导入基础组合子
import { $K, $W } from './combinators';

// ============ Observable Monadic 函数 ============

// pureOb - pure/return 操作
export const pureOb = <T>(value: T): Observable<T> =>
  $K(value);

// joinOb - join 操作
export const joinOb = <T>(mmv: Observable<Observable<T>>): Observable<T> =>
  $W(mmv);

// bindOb - bind (>>=) 操作
export const bindOb = <T, U>(
  ob: Observable<T>,
  f: (value: T) => Observable<U>
): Observable<U> =>
  (invalidate: Invalidate) => f(ob(invalidate))(invalidate);

// mapOb - map (fmap) 操作
export const mapOb = <T, U>(
  ob: Observable<T>,
  f: (value: T) => U
): Observable<U> =>
  bindOb(ob, (value) => pureOb(f(value)));

// apOb - ap 操作
export const apOb = <T, U>(
  fab: Observable<(value: T) => U>,
  ob: Observable<T>
): Observable<U> =>
  (invalidate: Invalidate) => fab(invalidate)(ob(invalidate));

// ============ 实用 Observable 函数 ============

// lift2Ob - 提升二元函数
export const lift2Ob = <A, B, C>(
  f: (a: A, b: B) => C
) => (
  ob1: Observable<A>,
  ob2: Observable<B>
): Observable<C> =>
  bindOb(ob1, (a) => mapOb(ob2, (b) => f(a, b)));

// lift3Ob - 提升三元函数
export const lift3Ob = <A, B, C, D>(
  f: (a: A, b: B, c: C) => D
) => (
  ob1: Observable<A>,
  ob2: Observable<B>,
  ob3: Observable<C>
): Observable<D> =>
  bindOb(ob1, (a) => lift2Ob((b: B, c: C) => f(a, b, c))(ob2, ob3));

// sequenceOb - 将 Observable<T>[] 转换为 Observable<T[]>
export const sequenceOb = <T>(observables: Observable<T>[]): Observable<T[]> => {
  if (observables.length === 0) {
    return pureOb([]);
  }
  
  return observables.reduce(
    (acc, ob) => lift2Ob<T[], T, T[]>((arr, value) => [...arr, value])(acc, ob),
    pureOb([] as T[])
  );
};

// traverseOb - 将 A[] 通过 f: A => Observable<B> 转换为 Observable<B[]>
export const traverseOb = <A, B>(
  f: (a: A) => Observable<B>
) => (as: A[]): Observable<B[]> =>
  sequenceOb(as.map(f));

// filterOb - 过滤 Observable 值
export const filterOb = <T>(
  ob: Observable<T>,
  predicate: (value: T) => boolean
): Observable<T | undefined> =>
  bindOb(ob, (value) => 
    predicate(value) ? pureOb(value) : pureOb(undefined)
  );

// whenOb - 条件性执行
export const whenOb = <T>(
  condition: Observable<boolean>,
  ob: Observable<T>
): Observable<T | undefined> =>
  bindOb(condition, (cond) => 
    cond ? mapOb(ob, (value) => value) : pureOb(undefined)
  );

// unlessOb - 条件性执行（反向）
export const unlessOb = <T>(
  condition: Observable<boolean>,
  ob: Observable<T>
): Observable<T | undefined> =>
  whenOb(mapOb(condition, (b) => !b), ob);

// zipOb - 将两个 Observable 组合成元组
export const zipOb = <A, B>(
  ob1: Observable<A>,
  ob2: Observable<B>
): Observable<[A, B]> =>
  lift2Ob<A, B, [A, B]>((a, b) => [a, b])(ob1, ob2);

// zipWithOb - 使用函数组合两个 Observable
export const zipWithOb = <A, B, C>(
  f: (a: A, b: B) => C,
  ob1: Observable<A>,
  ob2: Observable<B>
): Observable<C> =>
  lift2Ob(f)(ob1, ob2);

// catchOb - 错误处理
export const catchOb = <T, E>(
  ob: Observable<T>,
  handler: (error: E) => Observable<T>
): Observable<T> =>
  (invalidate: Invalidate) => {
    try {
      return ob(invalidate);
    } catch (error) {
      return handler(error as E)(invalidate);
    }
  };

// recoverOb - 从错误中恢复
export const recoverOb = <T>(
  ob: Observable<T>,
  defaultValue: T
): Observable<T> =>
  catchOb(ob, (_error) => pureOb(defaultValue));

// throttleOb - 节流
export const throttleOb = <T>(
  ob: Observable<T>,
  ms: number
): Observable<T> => {
  let lastTime = 0;
  let lastValue: T;
  
  return (invalidate: Invalidate) => {
    const now = Date.now();
    if (now - lastTime >= ms) {
      lastTime = now;
      lastValue = ob(invalidate);
    }
    return lastValue!;
  };
};

// debounceOb - 防抖
export const debounceOb = <T>(
  ob: Observable<T>,
  ms: number
): Observable<T> => {
  let timeoutId: NodeJS.Timeout;
  
  return (invalidate: Invalidate) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      invalidate();
    }, ms);
    return ob(invalidate);
  };
};

// ============ 创建 Observable ============

// 创建 Observable
export const makeObservable = <T>(
  setup: (set: (value: T) => void) => T
): Observable<T> => {
  let currentValue: T;
  const invalidators = new Set<Invalidate>();

  const invalidate: Invalidate = () => {
    invalidators.forEach(inv => inv());
  };

  const set = (value: T): void => {
    currentValue = value;
    invalidate();
  };

  currentValue = setup(set);

  return (invalidate: Invalidate) => {
    invalidators.add(invalidate);
    return currentValue;
  };
};

// 创建 Updatable
export const makeUpdatable = <T>(initialValue: T): Updatable<T> => {
  let currentValue: T = initialValue;
  const invalidators = new Set<Invalidate>();

  const invalidate: Invalidate = () => {
    invalidators.forEach(inv => inv());
  };

  const observable: Observable<T> = (invalidate: Invalidate) => {
    invalidators.add(invalidate);
    return currentValue;
  };

  const update = (updater: (currentValue: T) => T): void => {
    currentValue = updater(currentValue);
    invalidate();
  };

  return {
    observable,
    update
  };
};

// ============ 向后兼容别名 ============

// 为了向后兼容，保留一些别名
export const combineOb = lift2Ob;
export const combine3Ob = lift3Ob;
export const liftA2 = lift2Ob;
export const liftA3 = lift3Ob;
export const catchErrorOb = catchOb;

// 重新导出基础组合子
export { $K, $S, $I, $B, $C, $W, $D, $E, $Y } from './combinators';
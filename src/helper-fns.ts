export const set = (obj: any, prop: any, value: any) => obj && (obj[prop] = value);
export const isTruthy = (x: any) => !!x;
export const isFalsey = (x: any) => !x;
export const throwError = (m?: string) => { throw Error(m) };

export const debounce = (fn: (...args: any[]) => void, delay: number) => {
  let timer: any;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};
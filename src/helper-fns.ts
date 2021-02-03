export const set = (obj: any, prop: any, value: any) => obj && (obj[prop] = value);
export const isTruthy = (x: any) => !!x;
export const isFalsey = (x: any) => !x;
export const throwError = (m?: string) => { throw Error(m) };

export const debounce = (delay: number, fn: (...args: any[]) => any) => {
  let timer: any;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

export const throttle = (limit: number, fn: (...args: any[]) => any) => {
  let wait = false;
  return (...args: any[]) => {
    if (!wait) {
      fn(...args);
      wait = true;
      setTimeout(() => { wait = false }, limit);
    }
  }
};
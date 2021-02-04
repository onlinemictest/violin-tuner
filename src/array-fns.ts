export const queue = <T>(a: T[] | null | undefined, x: T) => 
  (a?.pop(), a?.unshift(x), a);

export const closest = (a: number[], goal: number) => 
  a.reduce((prev, curr) => (Math.abs(curr - goal) < Math.abs(prev - goal) ? curr : prev));
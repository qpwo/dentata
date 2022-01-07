import {produce} from 'immer'

export const sum = (a: number, b: number): number => {
  if ("development" === process.env.NODE_ENV) {
    console.log("boop");
  }
  return a + b;
};

export class Dentata<T> {
  private data: T
  private listeners: Record<number, (t:T)=>void>
  constructor(data: T) {
    this.data = data
    this.listeners = []
  }
  $onUpdate(handleUpdate: (t:T)=>void): number{
    const id = randint()
    this.listeners[id] = handleUpdate
    return id
  }
  $set(newVal: T) {
    this.data = newVal
  }
  $val(): Readonly<T> {
    return  Object.freeze(this.data)
  }
  /** Use an immer draft to update the object in place but actually immutably whoa */
  $apply(func: (prev: T) => T): void {
    this.data   = produce(this.data, func)
    this._$fireListeners(this.data)
  }

  /** Return new value generated from previous value */
  $update(func: (prev: Readonly<T>) => T) {
    this.data = func(this.data)
    this._$fireListeners(this.data)
  }

  // hard part: dynamically generated getters...

  private _$fireListeners(newVal: T) {
    for (const listener of Object.values(this.listeners)) {
      listener(newVal)
    }
  }

}


function randint() {
  return Math.floor(Math.random() * 1000000000)
}

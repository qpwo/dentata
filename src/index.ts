type Listener<T> = (newVal: DeepReadonly<T>, oldVal: DeepReadonly<T>) => void

export class Cursor<T> {
    private listeners: Listener<T>[] = []
    private children: Map<keyof T, Cursor<any>[]> = new Map()
    constructor(
        private data: T,
        private parent?: Cursor<any>,
        private fromKey?: PropertyKey,
    ) {
        if (data === undefined)
            throw Error("must instantiate with non-undefined data")
    }
    get(): DeepReadonly<T> {
        return this.data as DeepReadonly<T>
    }
    /** Set data to `undefined` to remove all listeners and descendant cursors */
    set(newVal: T, parentKnows = false) {
        const oldVal = this.data
        this.data = newVal
        if (deepEquals(oldVal, newVal)) return

        for (const li of this.listeners) {
            li(newVal as DeepReadonly<T>, oldVal as DeepReadonly<T>)
        }
        for (const [key, val] of this.children.entries()) {
            const newHere = newVal?.[key]
            for (const c of val) {
                c.set(newHere, true)
            }
            if (newHere === undefined) {
                this.children.delete(key)
            }
        }
        if (newVal === undefined) {
            this.clearListeners()
        }
        if (!parentKnows)
            this?.parent?.setFromBelow(this, this.fromKey!, newVal)
    }

    apply(update: (prev: DeepReadonly<T>) => T) {
        const new_ = update(this.data as DeepReadonly<T>)
        this.set(new_)
    }

    clearListeners() {
        this.listeners.splice(0, this.listeners.length)
    }

    private setFromBelow<K extends keyof T>(
        child: Cursor<any>,
        key: K,
        newVal: T[K],
    ): void {
        const oldVal = this.data
        // @ts-expect-error
        this.data = Array.isArray(this.data) ? [...this.data] : { ...this.data }
        this.data[key] = newVal
        for (const li of this.listeners) {
            li(this.data as DeepReadonly<T>, oldVal as DeepReadonly<T>)
        }
        for (const c of this.children.get(key) ?? []) {
            if (c !== child) c.set(newVal, true)
        }
        if (newVal === undefined) {
            this.children.delete(key)
        }
        this?.parent?.setFromBelow(this, this.fromKey!, this.data)
    }
    // apply(makeNewData: (prev: Readonly<T>) => T) {}
    onChange(handleChange: Listener<T>) {
        this.listeners.push(handleChange)
    }
    select<K extends keyof T>(key: K) {
        const c = new Cursor(this.data[key], this, key)
        if (!this.children.has(key)) {
            this.children.set(key, [])
        }
        this.children.get(key)?.push(c)
        return c
    }
}

const deepEquals = memoize(deepEquals_, 50000)
function deepEquals_(a: unknown, b: unknown): boolean {
    if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return true

    // prettier-ignore
    if (typeof a !== typeof b || // different types
        typeof a !== "object" ||
        typeof b !== "object" || // nonequal primitives
        (a === null || b === null) // one is null but not other
    )
        return false

    // So a and b are both either arrays or objects

    const aArr = Array.isArray(a)
    const bArr = Array.isArray(b)
    if (aArr !== bArr) return false
    if (aArr && bArr) {
        if (a.length !== b.length) return false
        return a.every((ai, i) => deepEquals(ai, b[i]))
    }
    // both regular objects
    const ak = Object.keys(a)
    const bk = Object.keys(b)
    if (ak.length !== bk.length) return false
    ak.sort()
    bk.sort()
    if (!ak.every((aki, i) => aki === bk[i])) return false
    // @ts-expect-error
    return ak.every(k => deepEquals(a[k], b[k]))
}

function memoize<Args extends unknown[], Result extends unknown>(
    f: (...args: Args) => Result,
    maxSize = -1,
): (...args: Args) => Result {
    const map = new Map<Args, Result>()
    function g(...args: Args): Result {
        if (map.has(args)) return map.get(args)!

        if (maxSize > 0 && map.size >= maxSize) map.clear()

        const result = f(...args)
        map.set(args, result)
        return result
    }
    return g
}

type DeepReadonly<T> = T extends (infer R)[]
    ? DeepReadonlyArray<R>
    : T extends Function
    ? T
    : T extends object
    ? DeepReadonlyObject<T>
    : T

interface DeepReadonlyArray<T> extends ReadonlyArray<DeepReadonly<T>> {}

type DeepReadonlyObject<T> = {
    readonly [P in keyof T]: DeepReadonly<T[P]>
}

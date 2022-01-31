type Listener<T> = (prev: Readonly<T>, new_: Readonly<T>) => void

export class Cursor<T> {
    private listeners: Listener<T>[] = []
    private children: Map<PropertyKey, Cursor<any>[]> = new Map()
    constructor(
        private data: T,
        private parent?: Cursor<any>,
        private fromKey?: PropertyKey,
    ) {}
    get(): Readonly<T> {
        return this.data
    }
    set(newVal: T) {
        const oldVal = this.data
        this.data = newVal
        if (deepEquals(oldVal, newVal)) return

        for (const li of this.listeners) {
            li(oldVal, newVal)
        }
        for (const [key, val] of this.children.entries()) {
            const newHere = newVal?.[key]
            for (const c of val) {
                c.set(newHere)
            }
            if (newHere === undefined) {
                this.children.delete(key)
            }
        }
        if (newVal === undefined) {
            this.clearListeners()
        }
        this?.parent?.setFromBelow(this?.fromKey, newVal)
    }

    clearListeners() {
        this.listeners.splice(0, this.listeners.length)
    }

    private setFromBelow<K extends keyof T>(key: K, newVal: T[K]): void {
        const oldVal = this.data
        this.data = { ...this.data, key: newVal }
        for (const li of this.listeners) {
            li(oldVal, this.data)
        }
        if (newVal === undefined) {
            this.children.delete(key)
        }
        this?.parent?.setFromBelow(this?.fromKey, this.data)
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
function deepEquals_(a: any, b: any): boolean {
    if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return true

    // prettier-ignore
    if (typeof a !== typeof b || // different types
        typeof a !== "object" || // nonequal primitives
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
    return ak.every(k => deepEquals(a[k], b[k]))
}

function memoize<Args extends any[], Result extends any>(
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

/** Dentata is an extremely simple and fast state manager / data tree, similar to Baobab */

export type Listener<T> = (
    newVal: DeepReadonly<T>,
    oldVal: DeepReadonly<T>,
) => void

/** An extremely simple and fast state manager / data tree
 * Behavior is well-defined for arrays, objects, functions, string, number, bigint, boolean, undefined, symbol, and null.
 * Setting a cursor to undefined removes all listeners and descendent cursors.
 * Deleting an object or array key also clears associated descendant cursors and listeners.
 * Behavior is not well-defined for Set, Map, Date, Error, regex, buffers / typed arrays, WebAssembly, etc.
 */
export class Dentata<T> {
    private listeners: Listener<T>[] = []
    private children: Map<keyof T, Dentata<any>[]> = new Map()
    private data: T
    private beenGot = false
    constructor(
        data: T,
        private parent?: Dentata<any>,
        private fromKey?: PropertyKey,
    ) {
        if (data === undefined)
            throw Error("must instantiate with non-undefined data")
        this.data = shallowCopy(data)
    }
    /** Get the current value at the cursor */
    get(): DeepReadonly<T> {
        this.beenGot = true
        return this.data as DeepReadonly<T>
    }
    /** Set data of current cursor and notify relevant onChange listeners. Set to `undefined` to remove all listeners and descendant cursors. */
    set(newVal: T, _parentKnows = false) {
        const oldVal = this.data
        this.data = newVal
        if (
            this.listeners.length === 0 &&
            this.children.size === 0 &&
            this.parent === undefined
        )
            return
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
        if (!_parentKnows)
            this?.parent?.setFromBelow(this, this.fromKey!, newVal)
    }

    setIn<K extends keyof T>(k: K, val: T[K]): void {
        if (deepEquals(val, this.data?.[k])) return
        this.setFromBelow(null, k, val)
        // this.set({ ...this.data, [k]: val }, false, true)
    }

    /** Alias for get + set. Update the old value into a new value. Do not mutate the argument. */
    apply(update: (prev: DeepReadonly<T>) => T) {
        const new_ = update(this.data as DeepReadonly<T>)
        this.set(new_)
    }

    /** Get a cursor deeper into the tree. It will be notified of parent changes and will tell parent if it changes (if either has change listeners). */
    select<K extends keyof T>(key: K) {
        const c = new Dentata(shallowCopy(this.data[key]), this, key)
        if (!this.children.has(key)) {
            this.children.set(key, [])
        }
        this.children.get(key)?.push(c)
        return c
    }
    /** Alias for Dentata.select */
    s<K extends keyof T>(key: K) {
        return this.select(key)
    }

    /** Listen for changes to the data at this cursor, including changes originating in parents or children.  */
    onChange(handleChange: Listener<T>) {
        this.listeners.push(handleChange)
    }

    /** Remove all onChange listeners on this cursor */
    clearListeners() {
        this.listeners.splice(0, this.listeners.length)
    }

    /** Assumes the newVal is different so skips equality check */
    private setFromBelow<K extends keyof T>(
        child: Dentata<any> | null,
        key: K,
        newVal: T[K],
    ): void {
        let oldVal = null
        if (this.listeners.length > 0) {
            oldVal = shallowCopy(this.data)
        }
        // don't make a copy unless the data has had .get() called on it.
        // This way you can can do many sets between gets cheaply
        if (this.beenGot) {
            this.data = shallowCopy(this.data)
            this.beenGot = false
        }
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
}

/** Alias for Dentata */
export const Dent = Dentata
export type Dent<T> = Dentata<T>

export interface DentataLike<T> {
    get: () => DeepReadonly<T>
    onChange: (l: Listener<T>) => void
}

/** Create a synthetic data cursor for computed values on another data cursor */
export function syntheticCursor<InputData, OutputData>(
    fromCursor: DentataLike<InputData>,
    compute: (t: DeepReadonly<InputData>) => OutputData,
    settings: { equality: "===" | "deep" } = { equality: "===" },
): DentataLike<OutputData> {
    type ImOut = DeepReadonly<OutputData>
    const { equality } = settings
    const listeners: Listener<OutputData>[] = []
    fromCursor.onChange((oldX, newX) => {
        const [oldY, newY] = [compute(oldX), compute(newX)]
        if (
            (equality === "===" && oldY !== newY) ||
            (equality === "deep" && !deepEquals(oldY, newY))
        ) {
            for (const l of listeners) {
                l(newY as ImOut, oldY as ImOut)
            }
        }
    })
    return {
        get: () => compute(fromCursor.get()) as ImOut,
        onChange: l => listeners.push(l),
    }
}

/** The cached equality algorithm, mainly exported so you can test it for your particular case.
 * The last 50k input pairs are cached using their object ids via a js Map.
 * It does nothing fancy, just direct `===` comparison for everything except arrays & objects & NaN.
 * Note that unlike lodash.isEqual, deepEquals(Object(1), 1) is false.
 * It uses Reflect.ownKeys() to get symbol keys from objects.
 */
export const deepEquals = memoize(deepEquals_, 50000)
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

    if (Array.isArray(a) !== Array.isArray(b)) return false
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false
        return a.every((ai, i) => deepEquals(ai, b[i]))
    }
    // both regular objects
    const ak = Reflect.ownKeys(a)
    const bk = Reflect.ownKeys(b)
    if (ak.length !== bk.length) return false
    for (const k of ak) if (!Reflect.has(a, k)) return false
    for (const k of bk) if (!Reflect.has(b, k)) return false
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

function shallowCopy<T>(x: T): T {
    if (typeof x === "object") {
        if (x == null) return x
        if (Array.isArray(x)) {
            // @ts-expect-error
            return [...x]
        }
        return { ...x }
    }
    return x
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

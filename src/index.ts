// TODO: diff computing can be more efficient. Only get diff of items that have cursors attached with change listeners.

type Id = string

type Func = (...args: any[]) => any

type Path = PropertyKey[]
type ValidTree =
    | bigint
    | boolean
    | null
    | number
    | string
    | symbol
    | Func
    | SubTree
    | ValidTree[]

type SubTree = { [key: PropertyKey]: ValidTree }
type KeyOf<T> = T extends SubTree ? keyof T : never
type ChangeListener<T> = (
    newVal: Readonly<T>,
    oldVal: Readonly<T>,
    unsubscribe: Unsubscribe,
) => void
type Unsubscribe = () => void

type KeyDiff<T> =
    | { deleted: KeyOf<T>[]; added: KeyOf<T>[]; changed: KeyOf<T>[] }
    | "nodiff"
    | "notobj"

type Obj = Record<PropertyKey, any>

type Cursors = Map<Path, Cursor[]>
type ChangeListeners<T> = Record<Id, ChangeListener<T>>
type DeleteListeners = (() => void)[]

export class Dentata<T extends ValidTree = any> {
    private cursors: Cursors = new Map()
    cursor: Cursor<T>
    constructor(private data: T) {
        this.cursor = new Cursor<T>(this, [])
    }

    // called by self or parent, but never by child
    public set(path: Path, value: unknown) {
        const prev = getPath(this.data, path)
        setPath(this.data, path, value) // TODO: handle deletes and changes
        this.handleChange(path, prev, value)
    }

    public get(path: Path): unknown {
        return getPath(this.data, path)
    }

    // you can have multiple cursors at the same path
    public select<T extends ValidTree>(path: Path) {
        const c = new Cursor<T>(this, path)
        this.cursors.set(path, [...(this.cursors.get(path) ?? []), c])
        return c
    }

    /** Release all cursors and event listeners */
    public destroy() {
        // TODO
    }
    private handleChange(path: Path, prev: any, new_: any) {
        // TODO
        // find relevant cursors that have change or delete listeners
        // take efficient diff to find which cursors were changed or deleted and notify them
    }
}

export class Cursor<T extends ValidTree = any> {
    private changeListeners: ChangeListeners<T> = {}
    private deleteListeners: DeleteListeners = []

    constructor(private root: Dentata, private path: Path) {}
    get(): Readonly<T>
    get<K extends KeyOf<T>>(key: K): Readonly<T[K]>
    get<K extends KeyOf<T>>(key?: K) {
        if (key === undefined) return this.root.get(this.path) as Readonly<T>
        return this.root.get([...this.path, key]) as Readonly<T[K]>
    }

    public hasChangeListeners(): boolean {
        return numKeys(this.changeListeners) > 0
    }

    set(newValue: T): void {
        this.root.set(this.path, newValue)
    }

    update(makeNew: (old: Readonly<T>) => T) {
        if (typeof makeNew !== "function")
            throw Error("update(makeNew) called without function argument")
        const prev = this.root.get(this.path) as T
        const new_ = makeNew(prev)
        this.root.set(this.path, new_)
    }

    // @ts-expect-error
    select<K extends KeyOf<T>>(key: K): Cursor<T[K]> {
        if (!isPropertyKey(key))
            throw Error(`value ${key} is not a valid object key`)
        if (!isSubTree(this.get()))
            throw Error(
                `tried to select(${key}) when cursor data was not object/record`,
            )

        // @ts-expect-error
        return this.root.select<T[K]>([...this.path, key])
    }
    // selectDeep() // TODO
    /** Alias for Cursor.select() */
    // @ts-expect-error
    s<K extends T extends SubTree ? keyof T : never>(key: K): Cursor<T[K]> {
        return this.select(key)
    }

    onChange(handleChange: ChangeListener<T>): Unsubscribe {
        const id = makeId()
        this.changeListeners[id] = handleChange
        return () => {
            delete this.changeListeners[id]
        }
    }

    onDelete(handleDelete: () => void) {
        this.deleteListeners.push(handleDelete)
    }

    clearListeners(): void {
        clearObj(this.changeListeners)
        clearObj(this.deleteListeners)
    }

    getReadOnly(): ROCursor<T> {
        return new ROCursor(this)
    }

    private notifyChangeListeners(newData: T, oldData: T) {
        for (const [id, listener] of Object.entries(this.changeListeners)) {
            listener(newData, oldData, () => delete this.changeListeners[id])
        }
    }
}

/** Read-only cursor */
export class ROCursor<T extends ValidTree = any> {
    constructor(private cursor: Cursor) {}
    get(): Readonly<T>
    get<K extends KeyOf<T>>(key: K): Readonly<T[K]>
    get<K extends KeyOf<T>>(key?: K) {
        // @ts-expect-error
        return this.cursor.get(key)
    }

    public hasChangeListeners(): boolean {
        return this.cursor.hasChangeListeners()
    }

    // @ts-expect-error
    select<K extends KeyOf<T>>(key: K): ROCursor<T[K]> {
        // @ts-expect-error
        return new ROCursor(this.cursor.select(key))
    }
    // @ts-expect-error
    s<K extends T extends SubTree ? keyof T : never>(key: K): ROCursor<T[K]> {
        return this.select(key)
    }

    onChange(handleChange: ChangeListener<T>): Unsubscribe {
        return this.cursor.onChange(handleChange)
    }

    onDelete(handleDelete: () => void) {
        return this.cursor.onDelete(handleDelete)
    }

    clearListeners(): void {
        this.cursor.clearListeners()
    }
}

function isSubTree(x: unknown): x is SubTree {
    return typeof x === "object" && x !== null && !Array.isArray(x)
}

function makeId(): string {
    return Math.random().toString().slice(2)
}

function hasKey(o: any, key: PropertyKey): boolean {
    return Object.prototype.hasOwnProperty.call(o, key)
}

function isPropertyKey(x: unknown): x is PropertyKey {
    const t = typeof x
    return t === "string" || t === "symbol" || t === "number"
}

function numKeys(o: any): number {
    return Object.keys(o).length
}

function keysOf<T extends Obj>(o: T): (keyof T)[] {
    return Object.keys(o).filter(k => o[k] !== undefined)
}

function valuesOf<T extends Obj>(o: T): Exclude<T[keyof T], undefined>[] {
    return Object.values(o).filter(x => x !== undefined)
}

function getKeyDiff<T extends Obj>(oldObj: T, newObj: T): KeyDiff<T> {
    if (oldObj === newObj) {
        return "nodiff"
    }
    const oldKeys = Object.keys(oldObj)
    const newKeys = Object.keys(newObj)
    const { deleted, added, overlap } = arrCompare(oldKeys, newKeys)
    const changed = overlap.filter(k => !deepEquals(oldObj[k], newObj[k]))
    if (deleted.length === 0 && added.length === 0 && overlap.length === 0) {
        return "nodiff"
    }
    return { deleted, added, changed } as KeyDiff<T>
}

function clearObj(o: Obj) {
    for (const key of Object.keys(o)) {
        delete o[key]
    }
}

// function getKeys<T extends Obj>(o: Obj): (keyof T)[] {
//     return Object.keys(o)
// }

function arrCompare<T>(
    oldArr: T[],
    newArr: T[],
): { added: T[]; deleted: T[]; overlap: T[] } {
    const so = new Set(oldArr)
    const sn = new Set(newArr)
    return {
        added: Array.from(setDiff(sn, so)),
        deleted: Array.from(setDiff(so, sn)),
        overlap: Array.from(setIntersect(so, sn)),
    }
}

function setDiff<T>(a: Set<T>, b: Set<T>): Set<T> {
    const d = new Set<T>()
    a.forEach(x => !b.has(x) && d.add(x))
    return d
}

function setIntersect<T>(a: Set<T>, b: Set<T>): Set<T> {
    const I = new Set<T>()
    a.forEach(x => b.has(x) && I.add(x))
    return I
}

const deepEquals = memoize(deepEquals_, 60000)
/** Works for json-like objects */
function deepEquals_(a: any, b: any): boolean {
    const isEq = a === b || (Number.isNaN(a) && Number.isNaN(b))
    if (isEq) return true

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

function getPath<T>(o: any, path: PropertyKey[]): T {
    // TODO: throw sensible error on failure
    let x = o
    for (const p of path) x = x[p]
    return x as T
}

function setPath(o: any, path: PropertyKey[], value: any) {
    // TODO: throw sensible error on failure
    let x = o
    for (let i = 0; i < path.length - 1; i++) x = x[path[i]]
    x[path[path.length - 1]] = value
}

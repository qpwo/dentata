// import { Draft, produce } from "immer"
// import { Diff, diff as calcDiff } from "deep-diff"
type Id = string

type Func = (...args: any[]) => any

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
type Listener<T> = (
    newVal: Readonly<T>,
    oldVal: Readonly<T>,
    keyDiff: KeyDiff<T>,
    unsubscribe: Unsubscribe,
) => void
type Unsubscribe = () => void

type KeyDiff<T> =
    | { deleted: KeyOf<T>[]; added: KeyOf<T>[]; changed: KeyOf<T>[] }
    | "nodiff"
    | "notobj"

type Obj = Record<PropertyKey, any>

// TODO: references can go bad. get() and set() need to use a path.
export class Dentata<T extends ValidTree = any> {
    private data: T
    private children: Partial<Record<keyof T, Dentata>> = {}
    // private children: { [K in KeyOf<T>]?: Dentata } = {}
    private changeListeners: Record<Id, Listener<T>> = {}
    private deleteListeners: (() => void)[] = []
    public parent?: Dentata
    public fromKey?: PropertyKey
    public deleted = false
    constructor(
        data: T,
        __: { parent: Dentata; fromKey: PropertyKey } | undefined,
    ) {
        this.data = data
        if (__ !== undefined) {
            this.parent = __.parent
            this.fromKey = __.fromKey
        }
    }
    get(): Readonly<T>
    get<K extends KeyOf<T>>(key: K): Readonly<T[K]>
    get<K extends KeyOf<T>>(key?: K) {
        if (key === undefined) return this.data
        if (!isPropertyKey(key)) throw Error(`invalid key: ${key}`)
        if (!isSubTree(this.data))
            throw Error(`tried to get(${key}) when data was not plain object`)
        return this.data[key]
    }

    set(newValue: T): void {
        const oldData = this.data
        this.data = newValue
        this.__handleChange(oldData, newValue)
    }

    update(makeNew: (old: Readonly<T>) => T) {
        if (typeof makeNew !== "function")
            throw Error("update(makeNew) called without function argument")
        const oldData = this.data
        this.data = makeNew(this.data)
        this.__handleChange(oldData, this.data)
    }

    select<K extends KeyOf<T>>(key: K): Dentata<T[K]> {
        if (!isSubTree(this.data))
            throw Error(
                `tried to select(${key}) when data was not plain object`,
            )
        if (hasKey(this.children, key)) return this.children[key]!
        const d = new Dentata(this.data[key], { parent: this, fromKey: key })
        this.children[key] = d
        // @ts-expect-error
        return d
    }
    s<K extends T extends SubTree ? keyof T : never>(key: K): Dentata<T[K]> {
        return this.select(key)
    }

    onChange(handleChange: Listener<T>): Unsubscribe {
        const id = makeId()
        this.changeListeners[id] = handleChange
        return () => {
            delete this.changeListeners[id]
        }
    }

    onDelete(handleDelete: () => void) {
        this.deleteListeners.push(handleDelete)
    }

    clearListeners({ recursive = false }): void {
        clearObj(this.changeListeners)
        clearObj(this.deleteListeners)
        if (recursive) {
            for (const child of valuesOf(this.children)) {
                child.clearListeners({ recursive: true })
            }
        }
    }

    // called by self or parent, but never by child
    __handleChange(oldData: T, newData: T) {
        const hasListeners = Object.keys(this.changeListeners).length === 0
        const hasChildren = Object.keys(this.children).length === 0
        if (!hasListeners && !hasChildren) return
        if (!isRecord(newData)) {
            if (deepEquals(oldData, newData)) return
            this.notifyChangeListeners(newData, oldData, "notobj")
            return
        }
        // TODO: What if value can be either object or primitive?
        //  If you set an object to a primitive, then do child listeners get deleted properly?
        const diff = getKeyDiff(oldData as Obj, newData as Obj) as KeyDiff<T>
        if (diff === "nodiff") return
        if (diff === "notobj") throw Error("uncreachable")
        this.notifyChangeListeners(newData, oldData, diff)
        if (!hasChildren) return
        for (const key of diff.changed) {
            this.children[key]?.__handleChange(oldData![key], newData![key])
        }

        for (const key of diff.deleted) {
            this.children[key]?.__handleDelete()
            delete this.children[key]
        }
        this.parent?.__handleChildChange(this.fromKey!, this.data)
        // we don't do anything with added keys
    }

    __handleChildChange<K extends KeyOf<T>>(key: K, new_: T[K]) {
        if (!isSubTree(this.data)) throw Error("unreachable")
        const oldData = { ...(this.data as Obj) } as T
        this.data[key] = new_
        this.notifyChangeListeners(this.data, oldData, {
            changed: [key],
            deleted: [],
            added: [],
        })
        return
    }

    // called by parent only, but never by child or self
    __handleDelete() {
        for (const child of valuesOf(this.children)) {
            child.__handleDelete()
        }
        for (const f of this.deleteListeners) {
            f()
        }
        clearObj(this) // TODO: is this okay? Does it even help?
        this.deleted = true
    }

    private notifyChangeListeners(newData: T, oldData: T, diff: KeyDiff<T>) {
        for (const [id, listener] of Object.entries(this.changeListeners)) {
            listener(
                newData,
                oldData,
                diff,
                () => delete this.changeListeners[id],
            )
        }
    }
}

function isSubTree(x: unknown): x is SubTree {
    return typeof x === "object" && x !== null && !Array.isArray(x)
}
function assertNonLeaf(x: unknown) {
    if (!isSubTree(x)) {
        throw Error("value is not object")
    }
}

function isRecord(x: unknown): x is Obj {
    return typeof x === "object" && !Array.isArray(x) && x != null
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

/* function test() {
    const d = new Dentata({ a: "foo", b: { c: { d: "e" } } })
    const g1 = d.get()
    const g2 = d.get("a")
    const hmm = d.select("a").get("indexOf") // expected
    const g3 = d.get("b")
    const d2 = d.select("a")
    d.select("c") // expected
    const g4 = d2.get()
    const d3 = d.select("b").select("c").select("d")
}
 */
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

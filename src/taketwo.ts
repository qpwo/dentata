// import { Draft, produce } from "immer"
// import { Diff, diff as calcDiff } from "deep-diff"
type Id = string

type ValidTree = string | number | boolean | NonLeaf
// type NonLeaf = { [key: string]: ValidTree } | { [key: number]: ValidTree } | { [key: symbol]: ValidTree }
type NonLeaf = { [key: PropertyKey]: ValidTree }
type KeyOf<T> = T extends NonLeaf ? keyof T : never
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

export class Dentata<T extends ValidTree = any> {
    private data: T
    private children: { [K in KeyOf<T>]?: Record<Id, Dentata> } = {} // TODO check INVARIANT: No empty subrecords
    private changeListeners: Record<Id, Listener<T>> = {}
    private deleteListeners: (() => void)[] = []
    public parent?: Dentata
    public fromKey?: string
    public deleted = false
    constructor(data: T, __: { parent: Dentata; fromKey: string } | undefined) {
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
        return this.data[key]
    }

    set(newValue: T): void {
        const oldData = this.data
        this.data = newValue
        this.__handleChange(oldData, newValue)
    }

    update(makeNew: (old: Readonly<T>) => T) {
        const oldData = this.data
        this.data = makeNew(this.data)
        this.__handleChange(oldData, this.data)
    }

    select<K extends KeyOf<T>>(
        key: K,
        // @ts-expect-error
    ): Dentata<T[K]> {
        if (typeof this.data !== "object")
            throw Error("cannot select within primitives")
        if (Array.isArray(this.data))
            throw Error("selecting in arrays causes undefined behavior")
        if (this.data == null) throw Error("cannot select in null data")

        const id = makeId()
        // @ts-expect-error
        const d = new Dentata(this.data[key], { parent: this, fromKey: key })
        if (!hasKey(this.children, key)) this.children[key] = { [id]: d }
        const ck = this.children[key]
        if (ck == null) throw Error("unreachable")
        ck[id] = d
        // @ts-expect-error
        return d
    }
    s<K extends T extends NonLeaf ? keyof T : never>(
        key: K,
        // @ts-expect-error
    ): Dentata<T[K]> {
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
            for (const key of keysOf(this.children)) {
                for (const child of Object.values(this.children[key]!)) {
                    child.clearListeners({ recursive: true })
                }
            }
        }
    }

    // called by self or parent, but never by child
    __handleChange(oldData: T, newData: T) {
        const hasListeners = Object.keys(this.changeListeners).length === 0
        const hasChildren = Object.keys(this.children).length === 0
        if (!(hasListeners || hasChildren)) return
        if (!isRecord(newData)) {
            if (deepEquals(oldData, newData)) return
            this.notifyChangeListeners(newData, oldData, "notobj")
            return
        }
        const diff = getKeyDiff(oldData as Obj, newData as Obj) as KeyDiff<T>
        if (diff === "nodiff") return
        if (diff === "notobj") throw Error("uncreachable")
        this.notifyChangeListeners(newData, oldData, diff)
        if (!hasChildren) return
        for (const key of diff.changed) {
            if (hasKey(this.children, key)) {
                for (const [_id, child] of Object.entries(
                    this.children[key]!,
                )) {
                    child.__handleChange(oldData[key], newData[key])
                }
            }
        }
        for (const key of diff.deleted) {
            if (hasKey(this.children, key)) {
                for (const [id, child] of Object.entries(this.children[key]!)) {
                    child.__handleDelete()
                    this.removeChild(key, id)
                }
            }
        }
        this?.parent?.__handleChildChange(this.fromKey!, this.data)
        // we don't do anything with added keys
    }
    notifyChangeListeners(newData: T, oldData: T, diff: KeyDiff<T>) {
        for (const [id, listener] of Object.entries(this.changeListeners)) {
            listener(
                newData,
                oldData,
                diff,
                () => delete this.changeListeners[id],
            )
        }
    }

    __handleChildChange<K extends KeyOf<T>>(key: K, new_: T[K]) {
        // @ts-expect-error
        const oldData = { ...this.data }
        this.data[key] = new_
        this.notifyChangeListeners(this.data, oldData, {
            changed: [key],
            deleted: [],
            added: [],
        })
    }

    // called by parent only, but never by child or self
    __handleDelete() {
        for (const key of keysOf(this.children)) {
            for (const child of Object.values(this.children[key]!)) {
                child.__handleDelete()
            }
        }
        for (const f of this.deleteListeners) {
            f()
        }
        // clearObj(this.children)
        // clearObj(this.changeListeners)
        // clearObj(this.deleteListeners)
        clearObj(this) // TODO: is this okay? Does it even help?
        this.deleted = true
    }

    // called by child or by self, but never by parent
    private removeChild(key: KeyOf<T>, id: Id) {
        if (hasKey(this.children, key) && hasKey(this.children[key], id))
            delete this.children[key]![id]
        if (numKeys(this.children[key]) === 0) {
            delete this.children[key]
        }
    }
}

function isRecord(x: unknown) {
    return typeof x === "object" && !Array.isArray(x) && x != null
}

function makeId(): string {
    return Math.random().toString().slice(2)
}

function hasKey(o: any, key: PropertyKey) {
    return Object.prototype.hasOwnProperty.call(o, key)
}

function numKeys(o: any): number {
    return Object.keys(o).length
}

function keysOf<T extends Obj>(o: T): (keyof T)[] {
    return Object.keys(o)
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

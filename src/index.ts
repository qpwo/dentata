// TODO: diff computing can be more efficient. Only get diff of items that have cursors attached with change listeners.

type Id = string

type Func = (...args: any[]) => any

type ValidKey = string

type Path = ValidKey[]
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

type SubTree = { [key: ValidKey]: ValidTree }
type KeyOf<T> = T extends SubTree ? keyof T : never
type ChangeListener<T> = (
    pathToChangedValue: Path,
    newVal: Readonly<T>,
    oldVal: Readonly<T>,
    unsubscribe: Unsubscribe,
) => void
type Unsubscribe = () => void

type Obj = Record<ValidKey, any>

type ChangeListeners<T> = Record<Id, ChangeListener<T>>
type DeleteListeners = (() => void)[]

const CURSORS = Symbol("CURSORS")

// the cursor tree holds all non-destroyed cursors, whether or not they have listeners
type CursorTree = { [key: ValidKey]: CursorTree } & { [CURSORS]?: Cursor[] }

export function makeDentata<T extends ValidTree>(data: T): Cursor<T> {
    return new Dentata(data).cursor
}

class Dentata<T extends ValidTree = any> {
    // private cursors: Cursors = new Map()
    private cursorTree: CursorTree = {}
    public cursor: Cursor<T>
    constructor(private data: T) {
        this.cursor = new Cursor<T>(this, [])
    }

    // called by self or parent, but never by child
    public __set(path: Path, value: unknown) {
        const prev = getPath(this.data, path)
        setPath(this.data, path, value)
        this.handleChange(path, prev, value)
    }

    public __get(path: Path): unknown {
        return getPath(this.data, path)
    }

    // you can have multiple cursors at the same path
    public select<T extends ValidTree>(path: Path) {
        const c = new Cursor<T>(this, path)

        addCursor(this.cursorTree, path, c)
        return c
    }

    /** Release all cursors and event listeners */
    public destroy() {
        // TODO
    }
    // prev and new are the value at the path,  not at the root
    private handleChange(path: Path, prev: any, new_: any) {
        let subtree = this.cursorTree

        // don't compute until we find a changeListener that needs it:
        let isEqual: null | boolean = null

        // cursors above change:
        let i = 0
        for (; i < path.length; i++) {
            for (const c of subtree[CURSORS] ?? []) {
                if (c.hasChangeListeners()) {
                    // ok compute it now if we haven't:
                    isEqual = isEqual ?? deepEquals_(prev, new_)
                    if (!isEqual) c._notifyChange(path.slice(i), prev, new_)
                }
            }

            if (!hasKey(subtree, path[i])) break
            subtree = subtree[path[i]]
        }
        // so all the cursors above the path have been notified if they exist and a change was actually made.
        if (i < path.length) return // the loop broke early so there aren't any cursors below the path
        if (!hasSomeListener(subtree)) return
        notifyAllListeners(subtree, prev, new_)
        pruneTree(this.cursorTree, subtree, new_, path)
    }
}

function addCursor(tree: CursorTree, path: ValidKey[], cursor: Cursor) {
    let subtree = tree
    for (const p of path) {
        if (!hasKey(subtree, p)) subtree[p] = {}
        subtree = subtree[p]
    }
    if (!(CURSORS in subtree)) subtree[CURSORS] = []
    subtree[CURSORS]!.push(cursor)
}

function hasSomeListener(tree: CursorTree): boolean {
    return (
        tree[CURSORS]?.some(
            c => c.hasChangeListeners() || c.hasDeleteListeners(),
        ) || Object.values(tree).some(subtree => hasSomeListener(subtree))
    )
}

function notifyAllListeners(
    subtree: CursorTree,
    prev: any,
    new_: any | undefined,
) {
    if (deepEquals_(prev, new_)) return
    for (const c of subtree?.[CURSORS] ?? []) {
        if (c.hasDeleteListeners() && new_ === undefined) {
            c._notifyDelete()
        } else if (c.hasChangeListeners()) {
            c._notifyChange([], prev, new_)
        }
    }
    for (const key of Object.keys(subtree)) {
        notifyAllListeners(subtree[key], prev?.[key], new_?.[key])
    }
}

export class Cursor<T extends ValidTree = any> {
    private changeListeners: ChangeListeners<T> = {}
    private deleteListeners: DeleteListeners = []
    _notifyChange(path: Path, prev: T, new_: T) {
        for (const [id, cl] of Object.entries(this.changeListeners)) {
            cl(path, new_, prev, () => delete this.changeListeners[id])
        }
    }

    _notifyDelete() {
        // the root Dentata handles deleting old cursors
        for (const dl of this.deleteListeners) dl()
    }

    constructor(private root: Dentata, private path: Path) {}
    get(): Readonly<T>
    get<K extends KeyOf<T>>(key: K): Readonly<T[K]>
    get<K extends KeyOf<T>>(key?: K) {
        if (key === undefined) return this.root.__get(this.path) as Readonly<T>
        if (typeof key !== "string") throw Error(`key ${key} is not a string`)
        return this.root.__get([...this.path, key]) as Readonly<T[K]>
    }

    public hasChangeListeners(): boolean {
        return numKeys(this.changeListeners) > 0
    }
    public hasDeleteListeners(): boolean {
        return this.deleteListeners.length > 0
    }

    set(newValue: T): void {
        this.root.__set(this.path, newValue)
    }

    update(makeNew: (old: Readonly<T>) => T) {
        if (typeof makeNew !== "function")
            throw Error("update(makeNew) called without function argument")
        const prev = this.root.__get(this.path) as T
        const new_ = makeNew(prev)
        this.root.__set(this.path, new_)
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

    /* private notifyChangeListeners(newData: T, oldData: T) {
        for (const [id, listener] of Object.entries(this.changeListeners)) {
            listener([], newData, oldData, () => delete this.changeListeners[id])
        }
    } */
}

/** Alias for Cursor */
export const Cur = Cursor

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

/** Alias for read-only cursor */
export const ROC = ROCursor

function isSubTree(x: unknown): x is SubTree {
    return typeof x === "object" && x !== null && !Array.isArray(x)
}

function makeId(): string {
    return Math.random().toString().slice(2)
}

function hasKey(o: any, key: ValidKey): boolean {
    return Object.prototype.hasOwnProperty.call(o, key)
}

function isPropertyKey(x: unknown): x is ValidKey {
    const t = typeof x
    return t === "string" || t === "symbol" || t === "number"
}

function numKeys(o: any): number {
    return Object.keys(o).length
}

function clearObj(o: Obj) {
    for (const key of Object.keys(o)) {
        delete o[key]
    }
}

// function getKeys<T extends Obj>(o: Obj): (keyof T)[] {
//     return Object.keys(o)
// }

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

function getPath<T>(o: any, path: ValidKey[]): T {
    // TODO: throw sensible error on failure
    let x = o
    for (const p of path) x = x[p]
    return x as T
}

function setPath(o: any, path: ValidKey[], value: any) {
    // TODO: throw sensible error on failure
    let x = o
    for (let i = 0; i < path.length - 1; i++) x = x[path[i]]
    x[path[path.length - 1]] = value
}

/* function setPathCopy(original: any, path: ValidKey[], value: any) {
    // TODO: throw sensible error on failure
    const result = {...original}
    let o = result
    for (const p of path) {

    }
    let x = o
    for (let i = 0; i < path.length - 1; i++) x = x[path[i]]
    x[path[path.length - 1]] = value
}
 */

/** Assumes that nothing above changedPath was deleted anything inside of it might have changed */
function pruneTree(
    cursorTree: CursorTree,
    subTree: CursorTree,
    newVal: any,
    pathToHere: Path,
) {
    // I wonder if this routine is slow...
    // so we need to remove all the cursors that point to `undefined`.
    // then we also want to climb up for each cursor we delete and prune the tree above it.
    // I suppose I'll do this depth first so we dont repeat the climbing too much.
    if (subTree === undefined) throw Error("unreachable")
    for (const key of Object.keys(subTree))
        pruneTree(cursorTree, subTree?.[key], newVal?.[key], [
            ...pathToHere,
            key,
        ])
    if (newVal !== undefined)
        // the data at the cursor here was not deleted
        return

    // clear all the listeners:
    while (true) {
        const c = subTree?.[CURSORS]?.pop()
        if (c === undefined) break
        c.clearListeners()
    }
    // the children should have already deleted themselves so we just have to go up:
    let toCheck = [cursorTree]
    for (const key of pathToHere) {
        toCheck.push(toCheck[toCheck.length - 1][key])
    }
    for (let i = toCheck.length - 1; i > 0; i--) {
        if (
            toCheck[i]?.[CURSORS]?.length === 0 &&
            Object.keys(toCheck[i]).length === 0
        ) {
            delete toCheck[i - 1][pathToHere[i]] // TODO: probably an off-by-one error here
        }
    }
}

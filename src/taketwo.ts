import { produce } from "immer"

type ValidTree = string | number | boolean | NonLeaf
// type NonLeaf = { [key: string]: ValidTree } | { [key: number]: ValidTree } | { [key: symbol]: ValidTree }
type NonLeaf = { [key: PropertyKey]: ValidTree }
export class Dentata<T extends ValidTree> {
    constructor(protected data: T) {}
    get(): Readonly<T>
    get<K extends keyof T>(key: K): Readonly<T[K]>
    get<K extends keyof T>(key?: K) {
        if (key === undefined) return this.data
        return this.data[key]
    }
    set(newValue: T): void {
        this.data = newValue
    }
    // select<K extends keyof T>(
    //     key: K,
    // ): T extends object ? Dentata<T[K]> : void {
    //     if (typeof this.data === "object") return new Dentata(this.data[key])
    //     return undefined
    // }
    select<K extends T extends NonLeaf ? keyof T : never>(
        key: K,
        // @ts-expect-error
    ): Dentata<T[K]> {
        if (typeof this.data !== "object") throw Error("")
        // @ts-expect-error
        return new Dentata(this.data[key])
    }
    s() {
        this.select()
    }
    update() {}
    onUpdate() {}
}

function test() {
    const d = new Dentata({ a: "foo", b: { c: { d: "e" } } })
    const g1 = d.get()
    const g2 = d.get("a")
    const g3 = d.get("b")
    const d2 = d.select("a")
    const g4 = d2.get()
    const d3 = d.select("b").select("c").select("d")
}

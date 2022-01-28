import { sum } from "./"

describe("blah", () => {
    it("works", () => {
        expect(sum(1, 1)).toEqual(2)
    })
})

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

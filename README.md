# Java Member Visibility

See at a glance which members of a Java class are **public**, **protected**, **package-private** or **private**.

VS Code's Outline shows the same icon for every method, whatever its access modifier
([vscode-java#1544](https://github.com/redhat-developer/vscode-java/issues/1544)).
This extension adds a **Java Members** panel next to Outline in the Explorer:

```
▾ OrderService                      + public
    + placeOrder(Order)             + public
    # validate(Order)               # protected
    ~ notifyWarehouse(Order)        ~ package-private
    − repository                    − private · final
```

- **UML visibility marks** `+ # ~ −` plus the word, so it works without relying on color.
- **Colored icons**: green public, yellow protected, blue package-private, red private (follows your theme's chart colors).
- **Implicit visibility is shown correctly**: interface members are public, enum constants are public,
  enum constructors are private, members without a modifier in a class are package-private — marked “(implicit)”.
- **Summary line**: how many public / protected / package / private members the file has.
- **Filter**: all members, public API only (public + protected), or public only.
- **Sort**: source order or by visibility.
- Click a member to jump to it.

## Requirements

[Language Support for Java™ by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java).
The panel reads the same symbols that Outline uses, so it works as soon as Outline works.

## Where is the panel?

Explorer side bar → **Java Members** (below Outline). You can drag it anywhere, e.g. into its own side bar.

## Known limitations

- The panel is separate from the built-in Outline: VS Code does not let extensions change Outline icons
  for symbols that another extension provides.
- Modifiers are read from the declaration text, so code that does not parse (mid-edit) may show stale marks
  until you finish typing.

## Feedback

Bug reports and feature requests: [GitHub Issues](https://github.com/korolserhii/java-member-visibility/issues).

## License

MIT

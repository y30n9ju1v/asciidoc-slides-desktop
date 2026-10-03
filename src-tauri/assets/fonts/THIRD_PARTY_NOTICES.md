# Font policy and Typst-related notices

Slides no longer ships the four Noto OTF files or enables Typst's embedded-fonts feature. PDF fonts are loaded from the user's system. Font availability, glyph coverage, and embedding permissions depend on that installation. The original bundled files and their notices remain in Git history.

KaTeX preview webfonts remain part of the frontend dependency; consult the pinned KaTeX package's license. This is not a font-free application. These notices do not replace a complete distribution license inventory.

## Internal PDF fallback assets

Disabling Typst's embedded text-font feature does not remove every asset in
`typst-assets`. The dependency's PDF-to-SVG rendering code references Foxit
standard PDF fonts independently of that feature. They are not offered as slide
text fonts. Retain their upstream notice (typst-assets 0.15.1):

```
Copyright 2014 PDFium Authors. All rights reserved.
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

   * Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.
   * Redistributions in binary form must reproduce the above
copyright notice, this list of conditions and the following disclaimer
in the documentation and/or other materials provided with the
distribution.
   * Neither the name of Google Inc. nor the names of its
contributors may be used to endorse or promote products derived from
this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

================================================================================
```

## Rust crates (code, not fonts)

**`typst-as-lib` (MIT)** — third-party wrapper around the Typst compiler
this app's `slide_compiler.rs` builds on; not part of the official Typst
project. License copied verbatim from the crate's own `LICENSE` file at the
pinned version (`=0.16.0`):

```
MIT License

Copyright (c) 2024 Reinhard Bronner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**`mitex` (Apache-2.0)** — LaTeX-to-Typst math conversion, pinned at
`=0.2.4`. The crate's `Cargo.toml` declares `license = "Apache-2.0"` but its
crates.io package does not ship its own `LICENSE` file to copy verbatim, so
this notice cites the SPDX identifier and the standard, canonical license
text rather than asserting a copy this project doesn't actually have:
<https://www.apache.org/licenses/LICENSE-2.0>.

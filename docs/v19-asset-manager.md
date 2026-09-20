# WebKiln v19 · Asset manager foundation

WebKiln v19 separates asset metadata from binary storage. Local projects continue to use their existing browser-local asset records. Cloud projects use a metadata-only adapter backed by D1. A future R2 adapter is represented by an interface and capability boundary only; this milestone creates no R2 bucket and performs no upload or image transformation.

Asset metadata includes folders, tags, alt text, captions, focal points, image dimensions, brand groups, content hashes, usage counts, and storage status. The dashboard supports search, sort, type filters, metadata editing, duplicate/hash visibility through the API contract, usage protection, and explicit unavailable-storage messaging. Delete is rejected server-side while usage remains non-zero. Replacement updates references inside authorized workspace page project data before usage metadata is adjusted.

The image-processing boundary reports transformations as unavailable unless a real provider is selected. WebP, AVIF, thumbnails, responsive sizes, and compression are not claimed or generated in v19.

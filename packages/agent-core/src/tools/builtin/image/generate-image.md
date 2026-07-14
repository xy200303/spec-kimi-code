Generate an image from a text prompt and save it to a file.

Use this when the user asks you to create, draw, or generate an image, diagram, illustration, or other visual content. The tool calls a configured image generation service (OpenAI-compatible `/images/generations` endpoint), downloads the resulting image, and writes it to `output_path`.

- `prompt` is the image description. Be specific and concise.
- `output_path` is where the image will be saved. Relative paths resolve against the working directory; absolute paths outside the working directory are also allowed. If the path has no file extension, the correct extension is appended automatically from the downloaded image format.
- Optional parameters (`model`, `size`, `quality`, `style`, `n`) are forwarded to the image generation service. When `n` is greater than 1, multiple images are generated and saved as `output_path` with `_0`, `_1`, ... suffixes before the extension.

After generating the image, report the saved file path to the user.

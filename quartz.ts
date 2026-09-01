import {
  loadQuartzConfig,
  loadQuartzLayout,
} from "./quartz/plugins/loader/config-loader"

import { componentRegistry } from "./quartz/components/registry"

import type { QuartzTransformerPlugin } from "@quartz-community/types"
import type { Root, Element } from "hast"
import type { PluggableList } from "unified"
import { visit } from "unist-util-visit"


// =============================================================================
// Explorer customization
// =============================================================================
//
// Converts filenames such as:
//
//   waypoint-pure-pursuit
//
// into:
//
//   Waypoint Pure Pursuit
//
// Frontmatter titles, when present, are still preferred by Quartz.
//

componentRegistry.setOptionOverrides("@quartz-community/explorer", {
  mapFn: (node: any) => {
    if (!node.isFolder) {
      let name =
        node.displayName ??
        node.slugSegment ??
        ""

      name = name
        // foo-bar / foo_bar -> foo bar
        .replace(/[-_]+/g, " ")

        // Capitalize words
        .replace(/\b[a-z]/g, (c: string) =>
          c.toUpperCase(),
        )

        // Project-specific cleanup
        .replace(/\bArucohub\b/gi, "ArUcoHub")
        .replace(/\bAruco\b/gi, "ArUco")
        .replace(/\bGui\b/g, "GUI")
        .replace(/\bSd\b/g, "SD")
        .replace(/\bNvme\b/g, "NVMe")
        .replace(/\bBle\b/g, "BLE")
        .replace(/\bMqtt\b/g, "MQTT")
        .replace(/\bEsp32\b/gi, "ESP32")

      node.displayName = name
    }

    return node
  },
})


// =============================================================================
// Obsidian Markdown image-size compatibility
// =============================================================================
//
// Your Obsidian syntax:
//
//   ![|300](attachments/robot0.png)
//
// is currently emitted by Quartz as:
//
//   <img src="..." alt="300">
//
// This transformer runs AFTER Markdown has become HTML and converts that into:
//
//   <img
//     src="..."
//     alt=""
//     width="300"
//     style="width:300px;max-width:100%;height:auto;"
//   >
//
// It also understands:
//
//   ![|100](image.png)
//   ![|300](image.png)
//   ![|300x200](image.png)
//
// and, if the parser leaves the caption intact:
//
//   ![Robot 00|300](image.png)
//   ![Robot 00|300x200](image.png)
//

const ObsidianImageSize: QuartzTransformerPlugin = () => {
  return {
    name: "ObsidianImageSize",

    htmlPlugins() {
      const plugins: PluggableList = []

      plugins.push(() => {
        return (tree: Root) => {
          visit(tree, "element", (node: Element) => {
            // Only process <img>
            if (node.tagName !== "img") {
              return
            }

            node.properties ??= {}

            const rawAlt = node.properties.alt

            if (rawAlt === undefined || rawAlt === null) {
              return
            }

            const alt = String(rawAlt).trim()

            let width: string | undefined
            let height: string | undefined
            let cleanAlt = alt


            // -----------------------------------------------------------------
            // Case 1
            //
            // Quartz has already converted:
            //
            //   ![|300](image.png)
            //
            // into:
            //
            //   alt="300"
            //
            // Also accepts:
            //
            //   alt="300x200"
            // -----------------------------------------------------------------

            let match = alt.match(
              /^(\d+)(?:x(\d+))?$/,
            )

            if (match) {
              width = match[1]
              height = match[2]
              cleanAlt = ""
            }


            // -----------------------------------------------------------------
            // Case 2
            //
            // If another Markdown parser leaves:
            //
            //   Robot 00|300
            //
            // intact in the alt attribute.
            // -----------------------------------------------------------------

            if (!match) {
              match = alt.match(
                /^(.*?)\|(\d+)(?:x(\d+))?$/,
              )

              if (match) {
                cleanAlt = match[1]?.trim() ?? ""
                width = match[2]
                height = match[3]
              }
            }


            // Not an Obsidian-sized image
            if (!width) {
              return
            }


            // -----------------------------------------------------------------
            // Clean alt text
            // -----------------------------------------------------------------

            node.properties.alt = cleanAlt


            // -----------------------------------------------------------------
            // HTML width / height attributes
            // -----------------------------------------------------------------

            node.properties.width = Number(width)

            if (height) {
              node.properties.height = Number(height)
            }


            // -----------------------------------------------------------------
            // Inline CSS
            //
            // We deliberately set width inline because some Quartz/theme
            // styles can otherwise make images fill the article width.
            //
            // max-width:100% keeps the image responsive on small screens.
            // -----------------------------------------------------------------

            const existingStyle =
              typeof node.properties.style === "string"
                ? node.properties.style.trim()
                : ""

            let sizeStyle =
              `width:${width}px;` +
              `max-width:100%;`

            if (height) {
              sizeStyle += `height:${height}px;`
            } else {
              sizeStyle += "height:auto;"
            }

            if (existingStyle.length > 0) {
              const separator =
                existingStyle.endsWith(";")
                  ? ""
                  : ";"

              node.properties.style =
                existingStyle +
                separator +
                sizeStyle
            } else {
              node.properties.style = sizeStyle
            }
          })
        }
      })

      return plugins
    },
  }
}


// =============================================================================
// Load Quartz configuration
// =============================================================================

const config = await loadQuartzConfig()


// Add our local HTML transformer after the normal Quartz transformers.
//
// This is important because Obsidian-flavored-markdown has already converted
// the Markdown image into an HTML <img> by the time this runs.

config.plugins.transformers.push(
  ObsidianImageSize(),
)


export default config


// =============================================================================
// Load layout
// =============================================================================

export const layout = await loadQuartzLayout()

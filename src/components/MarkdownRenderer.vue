<script setup lang="ts">
import { computed } from 'vue'
import { sanitizeNavigationUrl } from '@/utils/urlHelper'

const props = defineProps<{
  content: string
}>()

interface Token {
  type: 'text' | 'bold' | 'italic' | 'link' | 'image' | 'code' | 'br'
  content?: string
  url?: string
  alt?: string
}

function parseMarkdown(text: string): Token[] {
  if (!text)
    return []

  const tokens: Token[] = []
  let remaining = text

  while (remaining.length > 0) {
    const imageMatch = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/)
    if (imageMatch) {
      const url = sanitizeNavigationUrl(imageMatch[2])
      tokens.push(url
        ? { type: 'image', alt: imageMatch[1], url }
        : { type: 'text', content: imageMatch[0] },
      )
      remaining = remaining.slice(imageMatch[0].length)
      continue
    }

    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      const url = sanitizeNavigationUrl(linkMatch[2])
      tokens.push(url
        ? { type: 'link', content: linkMatch[1], url }
        : { type: 'text', content: linkMatch[0] },
      )
      remaining = remaining.slice(linkMatch[0].length)
      continue
    }

    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/) || remaining.match(/^__([^_]+)__/)
    if (boldMatch) {
      tokens.push({ type: 'bold', content: boldMatch[1] })
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    const italicMatch = remaining.match(/^\*([^*]+)\*/) || remaining.match(/^_([^_]+)_/)
    if (italicMatch) {
      tokens.push({ type: 'italic', content: italicMatch[1] })
      remaining = remaining.slice(italicMatch[0].length)
      continue
    }

    const codeMatch = remaining.match(/^`([^`]+)`/)
    if (codeMatch) {
      tokens.push({ type: 'code', content: codeMatch[1] })
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    if (remaining[0] === '\n') {
      tokens.push({ type: 'br' })
      remaining = remaining.slice(1)
      continue
    }

    const nextSpecial = remaining.search(/[![*_`\n]/)
    if (nextSpecial === -1) {
      tokens.push({ type: 'text', content: remaining })
      break
    }
    else if (nextSpecial === 0) {
      tokens.push({ type: 'text', content: remaining[0] })
      remaining = remaining.slice(1)
    }
    else {
      tokens.push({ type: 'text', content: remaining.slice(0, nextSpecial) })
      remaining = remaining.slice(nextSpecial)
    }
  }

  return tokens
}

const tokens = computed(() => parseMarkdown(props.content))
</script>

<template>
  <span class="markdown-content">
    <template v-for="(token, index) in tokens" :key="index">
      <img
        v-if="token.type === 'image'"
        :src="token.url"
        :alt="token.alt"
        loading="lazy"
        class="markdown-content__image"
      >
      <a v-else-if="token.type === 'link'" :href="token.url" target="_blank" rel="noopener noreferrer">
        {{ token.content }}
      </a>
      <strong v-else-if="token.type === 'bold'">{{ token.content }}</strong>
      <em v-else-if="token.type === 'italic'">{{ token.content }}</em>
      <code v-else-if="token.type === 'code'">{{ token.content }}</code>
      <br v-else-if="token.type === 'br'">
      <span v-else>{{ token.content }}</span>
    </template>
  </span>
</template>

<style scoped lang="scss">
.markdown-content {
  line-height: 1.6;
}

.markdown-content__image {
  display: inline-block;
  max-height: 200px;
  border-radius: var(--md-app-card-radius-small);
  vertical-align: middle;
}

code {
  border-radius: 6px;
  padding: 1px 6px;
  color: var(--md-sys-color-on-secondary-container);
  background: var(--md-sys-color-secondary-container);
  font-family: var(--md-app-number-font-family);
  font-size: 0.92em;
}
</style>

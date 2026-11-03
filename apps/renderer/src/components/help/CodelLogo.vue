<script setup lang="ts">
import { computed } from "vue";
import { CODEL, CODEL_LOGOS } from "../../constants/about";

/**
 * شعار كودل قناعاً يُلوَّن بلون النص (currentColor)، فيتبع الوضعين الفاتح
 * والداكن بلا نسخة لكل منهما ولا خلفية بيضاء خلفه. العرض من النسبة.
 */
const props = withDefaults(
  defineProps<{ variant?: keyof typeof CODEL_LOGOS; height?: number }>(),
  { variant: "full", height: 28 },
);
const style = computed(() => {
  const logo = CODEL_LOGOS[props.variant];
  return {
    height: `${props.height}px`,
    aspectRatio: String(logo.ratio),
    maskImage: `url("${logo.src}")`,
  };
});
</script>

<template>
  <span
    class="codel-logo"
    role="img"
    :aria-label="`شعار ${CODEL.nameAr} (${CODEL.nameEn})`"
    :style="style"
  />
</template>

<style scoped>
.codel-logo {
  display: inline-block;
  flex: none;
  background-color: currentColor;
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
}
</style>

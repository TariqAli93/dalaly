<script setup lang="ts">
import ThemeToggle from "../components/app/ThemeToggle.vue";
defineProps<{ subtitle?: string }>();
</script>

<template>
  <v-main>
    <section class="auth-screen">
      <v-card class="auth-panel auth-split rounded-none!" variant="text">
        <div class="auth-form-side">
          <div class="auth-form-top">
            <span>أهلاً بك في دلالي</span><ThemeToggle />
          </div>
          <div class="auth-form-content"><slot /></div>
          <div class="auth-form-footer">
            <v-icon icon="mdi-shield-check-outline" size="16" /> مساحة عمل مكتبك
            العقاري
          </div>
        </div>
        <!-- غلاف دليل الهوية: الاسم بالكوفي على ليل دجلة، سطر الوصف بالطابوق،
             قاعدة نحاسية، الشعار النصّي بالنحاس، وشريط الزقّورة في الأسفل.
             الألوان أدوار الثيم (الشريط الجانبي ونصّه ونحاسه) فتتبع المظهر. -->
        <aside class="auth-cover" aria-label="عن دلالي">
          <div class="auth-cover__top">دلالي · للمكاتب العقارية</div>
          <div class="auth-cover__brand">
            <v-icon
              icon="mdi-home-city-outline"
              size="56"
              class="auth-cover__mark"
              aria-hidden="true"
            />
            <div class="auth-cover__name">دلالي</div>
            <div class="auth-cover__sub">إدارة العروض العقارية</div>
            <div class="auth-cover__rule" aria-hidden="true" />
            <p class="auth-cover__lead">
              {{ subtitle ?? "نظّم عروضك، تابع زبائنك، وأدر إيجاراتك بسهولة." }}
            </p>
          </div>
          <p class="auth-cover__tagline">كل تفاصيل مكتبك، في مكان واحد.</p>
          <div class="auth-cover__band" aria-hidden="true" />
        </aside>
      </v-card>
    </section>
  </v-main>
</template>

<style scoped>
.auth-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: min(640px, calc(100dvh - 64px));
  border: 1px solid var(--dal-stroke);
  overflow: hidden;
  width: 100%;
  height: 100%;
}
.auth-form-side {
  display: flex;
  flex-direction: column;
  padding: 24px 40px;
  background-color: var(--dal-surface);
}
.auth-form-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--dal-muted);
  font-size: calc(12px * var(--dal-font-scale));
}
.auth-form-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-block: 36px;
}
.auth-form-content :deep(.v-form) {
  width: 100%;
  max-width: 340px;
}
.auth-form-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.auth-cover {
  display: flex;
  flex-direction: column;
  background: rgb(var(--v-theme-sidebar));
  color: rgb(var(--v-theme-on-sidebar));
}
.auth-cover__top {
  padding: 28px 32px 0;
  font-size: calc(13px * var(--dal-font-scale));
  font-weight: 500;
  color: var(--dal-nav-soft);
}
.auth-cover__brand {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px 32px;
  text-align: center;
}
.auth-cover__mark {
  color: rgb(var(--v-theme-on-sidebar));
}
.auth-cover__name {
  font-family: var(--dal-display-font);
  font-size: calc(64px * var(--dal-font-scale));
  font-weight: 600;
  line-height: 1.2;
}
.auth-cover__sub {
  margin-top: -8px;
  font-size: calc(18px * var(--dal-font-scale));
  color: var(--dal-nav-soft);
}
.auth-cover__rule {
  width: 64px;
  height: 2px;
  background: var(--dal-brass);
}
.auth-cover__lead {
  max-width: 30ch;
  margin: 0;
  font-size: calc(14px * var(--dal-font-scale));
  line-height: 1.8;
  color: var(--dal-nav-soft);
}
.auth-cover__tagline {
  margin: 0;
  padding: 0 32px 24px;
  text-align: center;
  font-size: calc(18px * var(--dal-font-scale));
  font-weight: 500;
  color: rgb(var(--v-theme-sidebar-accent));
}
.auth-cover__band {
  height: 96px;
  background-image: var(--dal-zig);
  background-repeat: repeat;
  background-size: 56px 48px;
  background-position: center bottom;
}
@media (max-width: 800px) {
  .auth-screen {
    padding: 16px;
  }
  .auth-split {
    grid-template-columns: 1fr;
    min-height: calc(100dvh - 32px);
    max-width: 480px;
  }
  .auth-cover {
    display: none;
  }
  .auth-form-side {
    padding: 24px;
  }
}
</style>

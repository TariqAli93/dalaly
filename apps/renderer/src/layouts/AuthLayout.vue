<script setup lang="ts">
import { useSetup } from "../composables/useSetup";
import ThemeToggle from "../components/app/ThemeToggle.vue";
import loginResidence from "../assets/login-residence.webp";
defineProps<{ subtitle?: string }>();
const { status } = useSetup();
</script>

<template>
  <v-main>
    <section class="auth-screen">
      <v-card class="auth-panel auth-split" variant="text">
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
        <aside
          class="auth-photo"
          :style="{
            backgroundImage: `linear-gradient(180deg, #10272955 0%, #10272933 25%, #102729d9 100%), url(${loginResidence})`,
          }"
          aria-label="منزل معاصر عند الغروب"
        >
          <div class="auth-photo__brand">
            <v-icon icon="mdi-home-city-outline" size="38" /><strong
              >دلالي</strong
            >
          </div>
          <div class="auth-photo__copy">
            <div class="auth-photo__eyebrow">إدارة العروض العقارية</div>
            <h2>كل تفاصيل مكتبك،<br />في مكان واحد.</h2>
            <p>
              {{ subtitle ?? "نظّم عروضك، تابع عملاءك، وأدر إيجاراتك بسهولة." }}
            </p>
          </div>
          <div class="auth-photo__footer">
            <span>دلالي · للمكاتب العقارية</span
            ><bdi>v{{ status?.app_version ?? "0.1.0" }}</bdi>
          </div>
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
  box-shadow: var(--dal-shadow-pop);
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
  font-size: calc(11px * var(--dal-font-scale));
  color: var(--dal-muted);
}
.auth-photo {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: white;
  padding: 32px;
  background-position: center;
  background-size: cover;
  background-color: #193638;
}
.auth-photo__brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.auth-photo__brand strong {
  font-size: calc(32px * var(--dal-font-scale));
  font-weight: 700;
}
.auth-photo__copy {
  margin-top: auto;
  padding-block: 32px;
}
.auth-photo__eyebrow {
  font-size: calc(13px * var(--dal-font-scale));
  color: #d6eeee;
  margin-bottom: 12px;
}
.auth-photo h2 {
  font-size: calc(32px * var(--dal-font-scale));
  line-height: 1.65;
  font-weight: 700;
}
.auth-photo p {
  margin-top: 12px;
  font-size: calc(13px * var(--dal-font-scale));
  color: #d6eeee;
}
.auth-photo__footer {
  display: flex;
  justify-content: space-between;
  font-size: calc(11px * var(--dal-font-scale));
  color: #d6eeee;
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
  .auth-photo {
    display: none;
  }
  .auth-form-side {
    padding: 24px;
  }
}
</style>

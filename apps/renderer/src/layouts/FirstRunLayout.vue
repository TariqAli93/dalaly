<script setup lang="ts"></script>

<template>
  <v-main>
    <section class="auth-screen">
      <v-card class="wizard-panel" rounded="lg" variant="flat" border>
        <v-card-text class="pa-7">
          <div class="d-flex align-center ga-3 mb-6">
            <v-avatar color="primary" rounded="lg">
              <v-icon icon="mdi-rocket-launch-outline" />
            </v-avatar>
            <div>
              <div class="text-h5 font-weight-bold">إعداد دلالي لأول مرة</div>
              <div class="text-body-2 text-medium-emphasis">
                سنقوم بتهيئة قاعدة البيانات وإنشاء أول مستخدم.
              </div>
            </div>
          </div>
          <slot />
        </v-card-text>
      </v-card>
    </section>
  </v-main>
</template>

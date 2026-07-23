<script setup lang="ts">
defineProps<{ subtitle?: string }>();
</script>

<template>
  <v-main>
    <section class="auth-screen">
      <v-card class="auth-panel" variant="flat" border>
        <v-card-text class="pa-7">
          <div class="d-flex align-center ga-3 mb-7">
            <v-avatar color="primary">
              <v-icon icon="mdi-home-city-outline" />
            </v-avatar>
            <div>
              <div class="text-h5 font-weight-bold">دلالي</div>
              <div class="text-body-2 text-medium-emphasis">
                {{ subtitle ?? "نظام محلي لإدارة عروض مكتب الوساطة العقارية" }}
              </div>
            </div>
          </div>
          <slot />
        </v-card-text>
      </v-card>
    </section>
  </v-main>
</template>

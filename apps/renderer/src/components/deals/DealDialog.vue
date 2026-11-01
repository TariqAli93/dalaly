<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import FormSection from "../shared/FormSection.vue";
import NumberField from "../app/NumberField.vue";
import PersonPicker from "../people/PersonPicker.vue";
import ListingPicker from "../contracts/ListingPicker.vue";
import * as dealsService from "../../services/deals.service";
import { getErrorMessage } from "../../services/api.service";
import { useAssignees } from "../../composables/useAssignees";
import { DEAL_TYPES, dealPartyLabels } from "../../constants/deals";
import { TASK_PRIORITIES } from "../../constants/crm";
import { RENT_PERIOD_LABELS } from "../../constants/domain";
import { formatAmount } from "../../utils/format";
import { minorToAmount, percentOfAmount } from "../../utils/money";
import type {
  Currency,
  DealPayload,
  DealRecord,
  DealType,
  PropertyRecord,
  RentalRecord,
  TaskPriority,
} from "../../types";

/**
 * إنشاء صفقة وتعديل بياناتها، بما يلزم فقط: النوع والعرض والزبون، ثم السعر
 * المتفق عليه والعمولة المتوقعة. المالك والسعر المطلوب يأخذهما الخادم من
 * العرض إن تُركا فارغين، فلا يُسألان؛ وبقية الحقول (العنوان والأولوية والموظف
 * والإغلاق المتوقع والعملة والملاحظات) في «خيارات إضافية». المرحلة لا تُعدَّل
 * هنا (لها أوامرها في صفحة الصفقة). `preset` يملأ النموذج من حيث فُتح (زبون،
 * عرض، طلب، مطابقة).
 */
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  deal?: DealRecord | null;
  preset?: Partial<DealPayload> | null;
}>();
const emit = defineEmits<{ saved: [DealRecord] }>();

const CURRENCIES: Array<{ value: Currency; title: string }> = [
  { value: "IQD", title: "دينار عراقي" },
  { value: "USD", title: "دولار أمريكي" },
];
const FIELD_DEFAULTS = {
  VTextField: { hideDetails: "auto" },
  VSelect: { hideDetails: "auto" },
  VAutocomplete: { hideDetails: "auto" },
  VTextarea: { hideDetails: "auto" },
};

const { assignees, loadAssignees } = useAssignees();
const saving = ref(false);
const error = ref("");
const fieldErrors = ref<Record<string, string[]>>({});
let opener: HTMLElement | null = null;
// While the dialog fills itself from a deal or preset, a change of kind is
// not the user's: it must not clear the listing it came with.
let filling = false;

function blank() {
  return {
    deal_type: "sale" as DealType,
    title: "",
    priority: "normal" as TaskPriority,
    client_person_id: null as number | null,
    owner_person_id: null as number | null,
    listing_id: null as number | null,
    assigned_user_id: null as number | null,
    purchase_request_id: null as number | null,
    rental_request_id: null as number | null,
    currency: "IQD" as Currency,
    asking_price: "" as string | number | null,
    agreed_price: "" as string | number | null,
    expected_commission: "" as string | number | null,
    expected_close_date: "",
    notes: "",
  };
}
const form = ref(blank());
const parties = computed(() => dealPartyLabels(form.value.deal_type));

/** The listing picked or loaded, for its owner and price (display only). */
const listing = ref<PropertyRecord | RentalRecord | null>(null);
/** «خيارات إضافية»: closed for a new deal, open when an edit has any. */
const more = ref(false);
/** The owner differs from the listing's: the picker shows. */
const changeOwner = ref(false);

// العمولة المتوقعة مبلغ أو نسبة من السعر (المتفق عليه، وإلا المطلوب)، بحساب
// الخادم نفسه للنسبة (percentOfAmount: نصف إلى الأعلى). آخر نسبة استُعملت على
// هذا الجهاز تُعرض اقتراحاً بنقرة، ولا تُملأ وحدها.
const RATE_KEY = "dalaly.deal.commission-rate.v1";
const commissionMode = ref<"amount" | "rate">("amount");
const rate = ref<string | number | null>("");
function savedRate() {
  try {
    return localStorage.getItem(RATE_KEY) ?? "";
  } catch {
    return "";
  }
}
const lastRate = ref(savedRate());

watch(open, (isOpen) => {
  if (!isOpen) {
    const target = opener;
    opener = null;
    if (target?.isConnected) void nextTick(() => target.focus());
    return;
  }
  opener = document.activeElement as HTMLElement | null;
  const source: Partial<DealPayload> & Partial<DealRecord> =
    props.deal ?? props.preset ?? {};
  filling = true;
  form.value = {
    ...blank(),
    deal_type: source.deal_type ?? "sale",
    title: source.title ?? "",
    priority: source.priority ?? "normal",
    client_person_id: source.client_person_id ?? null,
    owner_person_id: source.owner_person_id ?? null,
    listing_id:
      (source.deal_type === "rent" ? source.rental_id : source.property_id) ??
      null,
    assigned_user_id: source.assigned_user_id ?? null,
    purchase_request_id: source.purchase_request_id ?? null,
    rental_request_id: source.rental_request_id ?? null,
    currency: source.currency ?? "IQD",
    asking_price: source.asking_price ?? "",
    agreed_price: source.agreed_price ?? "",
    expected_commission: source.expected_commission ?? "",
    expected_close_date: source.expected_close_date ?? "",
    notes: source.notes ?? "",
  };
  void nextTick(() => (filling = false));
  listing.value = null;
  commissionMode.value = "amount";
  rate.value = "";
  lastRate.value = savedRate();
  const f = form.value;
  more.value = Boolean(
    props.deal &&
    (f.title ||
      f.assigned_user_id ||
      f.expected_close_date ||
      f.notes ||
      f.priority !== "normal" ||
      f.currency !== "IQD" ||
      f.asking_price),
  );
  // A preset or deal that names an owner without a listing shows the picker.
  changeOwner.value = Boolean(f.owner_person_id && !f.listing_id);
  error.value = "";
  fieldErrors.value = {};
  void loadAssignees();
});

/** Changing the kind clears what belongs to the other kind. */
watch(
  () => form.value.deal_type,
  (type, previous) => {
    if (filling || !previous || type === previous || props.deal) return;
    form.value.listing_id = null;
    form.value.purchase_request_id = null;
    form.value.rental_request_id = null;
    listing.value = null;
  },
);

/** A picked listing brings its owner when none is chosen yet. */
function listingPicked(picked: PropertyRecord | RentalRecord | null) {
  listing.value = picked;
  if (picked?.owner_person_id && !form.value.owner_person_id)
    form.value.owner_person_id = picked.owner_person_id;
}
function listingLoaded(loaded: PropertyRecord | RentalRecord) {
  listing.value = loaded;
}

const listingPrice = computed(() => {
  const item = listing.value;
  if (!item) return null;
  return "total_price" in item
    ? String(item.total_price)
    : String((item as RentalRecord).rent_price);
});
const listingPriceText = computed(() => {
  if (!listing.value || listingPrice.value === null) return "";
  const price = formatAmount(listingPrice.value, "IQD");
  return "rent_period" in listing.value
    ? `${price} ${RENT_PERIOD_LABELS[listing.value.rent_period] ?? ""}`.trim()
    : price;
});
/** The listing's owner, which the deal takes (or already has). */
const ownerText = computed(() => listing.value?.owner_name ?? "");
// An owner other than the listing's (from a preset or an earlier edit) is
// shown in its picker, never hidden behind the listing owner's name.
watch(listing, (item) => {
  const owner = form.value.owner_person_id;
  if (owner && item && item.owner_person_id !== owner) changeOwner.value = true;
});

/** The base a rate applies to: the agreed price, else the asking price. */
const rateBase = computed(() => {
  const agreed = String(form.value.agreed_price ?? "").replace(/,/g, "");
  if (agreed) return { amount: agreed, label: "من السعر المتفق عليه" };
  const asking = String(form.value.asking_price ?? "").replace(/,/g, "");
  if (asking) return { amount: asking, label: "من السعر المطلوب" };
  if (listingPrice.value)
    return { amount: listingPrice.value, label: "من سعر العرض" };
  return null;
});
const rateAmount = computed(() => {
  if (commissionMode.value !== "rate" || !rateBase.value || rate.value === "")
    return null;
  const minor = percentOfAmount(rateBase.value.amount, rate.value);
  return minor === null ? null : minorToAmount(minor);
});
watch(rateAmount, (amount) => {
  if (commissionMode.value === "rate")
    form.value.expected_commission = amount ?? "";
});
function useLastRate() {
  commissionMode.value = "rate";
  rate.value = lastRate.value;
}

const amount = (value: string | number | null) =>
  value === null || value === "" ? null : String(value);

/** A short review of what will be saved, above the save button. */
const review = computed(() => {
  const f = form.value;
  const parts = [
    `صفقة ${f.deal_type === "sale" ? "بيع" : "إيجار"}`,
    listing.value ? listing.value.name || listing.value.code : "",
    ownerText.value ? `${parties.value.owner}: ${ownerText.value}` : "",
    f.agreed_price
      ? `السعر ${formatAmount(String(f.agreed_price).replace(/,/g, ""), f.currency)}`
      : "",
    f.expected_commission
      ? `العمولة المتوقعة ${formatAmount(String(f.expected_commission).replace(/,/g, ""), f.currency)}`
      : "",
  ];
  return parts.filter(Boolean).join(" · ");
});

async function save() {
  if (saving.value) return;
  if (!form.value.client_person_id) {
    error.value = `اختر ${parties.value.client}.`;
    return;
  }
  saving.value = true;
  error.value = "";
  fieldErrors.value = {};
  const sale = form.value.deal_type === "sale";
  const payload: DealPayload = {
    deal_type: form.value.deal_type,
    title: form.value.title.trim() || null,
    priority: form.value.priority,
    property_id: sale ? form.value.listing_id : null,
    rental_id: sale ? null : form.value.listing_id,
    client_person_id: form.value.client_person_id,
    // A new deal left without an owner takes its listing's: the server fills
    // it when the field is absent. On an edit, empty means none.
    owner_person_id:
      form.value.owner_person_id ?? (props.deal ? null : undefined),
    assigned_user_id: form.value.assigned_user_id,
    purchase_request_id: sale ? form.value.purchase_request_id : null,
    rental_request_id: sale ? null : form.value.rental_request_id,
    currency: form.value.currency,
    asking_price: amount(form.value.asking_price),
    agreed_price: amount(form.value.agreed_price),
    expected_commission: amount(form.value.expected_commission),
    expected_close_date: form.value.expected_close_date || null,
    notes: form.value.notes.trim() || null,
  };
  try {
    const saved = props.deal
      ? await dealsService.updateDeal(props.deal.id, payload)
      : await dealsService.createDeal(payload);
    if (commissionMode.value === "rate" && rate.value !== "")
      try {
        localStorage.setItem(RATE_KEY, String(rate.value));
      } catch {
        // The suggestion stays for this session only.
      }
    open.value = false;
    emit("saved", saved);
  } catch (cause) {
    const issues = (
      cause as { issues?: Array<{ field?: string; message: string }> }
    )?.issues;
    if (issues?.length)
      for (const issue of issues) {
        if (issue.field)
          (fieldErrors.value[issue.field] ??= []).push(issue.message);
        else error.value = issue.message;
      }
    else error.value = getErrorMessage(cause);
    // A rejected field inside «خيارات إضافية» opens it.
    if (
      [
        "title",
        "owner_person_id",
        "asking_price",
        "expected_close_date",
        "currency",
      ].some((field) => fieldErrors.value[field]?.length)
    ) {
      more.value = true;
      if (fieldErrors.value.owner_person_id?.length) changeOwner.value = true;
    }
  } finally {
    saving.value = false;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyS") return;
  event.preventDefault();
  void save();
}
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="720"
    scrollable
    :persistent="saving"
    aria-labelledby="deal-dialog-title"
  >
    <v-card tag="form" @submit.prevent="save" @keydown="onKeydown">
      <v-card-title id="deal-dialog-title">{{
        deal ? `تعديل الصفقة ${deal.code}` : "صفقة جديدة"
      }}</v-card-title>
      <v-divider />
      <v-card-text>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{
          error
        }}</v-alert>
        <v-defaults-provider :defaults="FIELD_DEFAULTS">
          <FormSection title="العقار والزبون" :columns="2">
            <v-btn-toggle
              v-model="form.deal_type"
              class="form-section__wide"
              mandatory
              divided
              variant="outlined"
              color="primary"
              density="compact"
              :disabled="Boolean(deal)"
              aria-label="نوع الصفقة"
            >
              <v-btn
                v-for="type in DEAL_TYPES"
                :key="type.value"
                :value="type.value"
                >{{ type.title }}</v-btn
              >
            </v-btn-toggle>
            <ListingPicker
              v-model="form.listing_id"
              :kind="form.deal_type"
              :label="form.deal_type === 'sale' ? 'عرض البيع' : 'عرض الإيجار'"
              placeholder="ابحث برمز العرض أو المنطقة أو المالك"
              :hint="
                listingPriceText
                  ? `السعر المطلوب في العرض: ${listingPriceText}`
                  : undefined
              "
              :persistent-hint="Boolean(listingPriceText)"
              clearable
              @picked="listingPicked"
              @loaded="listingLoaded"
            />
            <PersonPicker
              v-model="form.client_person_id"
              :label="`${parties.client} *`"
              placeholder="ابحث بالاسم أو الهاتف"
              :error-messages="fieldErrors.client_person_id"
            />
            <div v-if="!changeOwner" class="deal-owner form-section__wide">
              <span class="deal-owner__label">{{ parties.owner }}:</span>
              <span class="deal-owner__name">{{
                ownerText ||
                (form.listing_id ? "مالك العرض" : "يؤخذ من العرض حين تختاره")
              }}</span>
              <v-btn variant="text" size="small" @click="changeOwner = true"
                >{{ parties.owner }} آخر</v-btn
              >
            </div>
            <PersonPicker
              v-else
              v-model="form.owner_person_id"
              :label="parties.owner"
              placeholder="يؤخذ من العرض إن تُرك فارغاً"
              clearable
              :error-messages="fieldErrors.owner_person_id"
            />
          </FormSection>
          <FormSection title="تفاصيل الصفقة" :columns="2">
            <NumberField
              v-model="form.agreed_price"
              label="السعر المتفق عليه"
              hint="يُترك فارغاً حتى يُتفق"
              persistent-hint
              :error-messages="fieldErrors.agreed_price"
            />
            <div class="deal-commission">
              <NumberField
                v-if="commissionMode === 'amount'"
                v-model="form.expected_commission"
                label="العمولة المتوقعة"
                :error-messages="fieldErrors.expected_commission"
              />
              <v-text-field
                v-else
                v-model="rate"
                label="نسبة العمولة %"
                dir="ltr"
                inputmode="decimal"
                :hint="
                  rateAmount
                    ? `${formatAmount(rateAmount, form.currency)} ${rateBase?.label ?? ''}`
                    : rateBase
                      ? 'اكتب النسبة'
                      : 'أدخل السعر المتفق عليه أو اختر العرض أولاً'
                "
                persistent-hint
                :error-messages="fieldErrors.expected_commission"
              />
              <v-btn-toggle
                v-model="commissionMode"
                mandatory
                divided
                density="compact"
                variant="outlined"
                aria-label="العمولة مبلغ أم نسبة"
              >
                <v-btn value="amount" title="مبلغ">مبلغ</v-btn>
                <v-btn value="rate" title="نسبة من السعر">%</v-btn>
              </v-btn-toggle>
            </div>
            <div
              v-if="
                lastRate &&
                commissionMode === 'amount' &&
                !form.expected_commission
              "
              class="form-section__wide"
            >
              <v-chip
                size="small"
                variant="tonal"
                color="primary"
                label
                prepend-icon="mdi-history"
                @click="useLastRate"
                >عمولة {{ lastRate }}% كالمرة السابقة</v-chip
              >
            </div>
          </FormSection>

          <v-btn
            variant="text"
            size="small"
            class="deal-more"
            :prepend-icon="more ? 'mdi-chevron-up' : 'mdi-chevron-down'"
            :aria-expanded="more"
            aria-controls="deal-more"
            @click="more = !more"
            >خيارات إضافية: العنوان، الأولوية، الموظف، العملة، الملاحظات</v-btn
          >
          <div v-show="more" id="deal-more">
            <FormSection title="خيارات إضافية" :columns="2">
              <v-text-field
                v-model="form.title"
                class="form-section__wide"
                label="عنوان مختصر (اختياري)"
                placeholder="مثلاً: بيت المنصور لعائلة أحمد"
                :error-messages="fieldErrors.title"
              />
              <v-select
                v-model="form.priority"
                :items="TASK_PRIORITIES"
                label="الأولوية"
              />
              <v-select
                v-model="form.assigned_user_id"
                :items="assignees"
                item-title="display_name"
                item-value="id"
                label="الموظف المسؤول"
                clearable
              />
              <v-text-field
                v-model="form.expected_close_date"
                type="date"
                label="الإغلاق المتوقع"
                :error-messages="fieldErrors.expected_close_date"
              />
              <v-select
                v-model="form.currency"
                :items="CURRENCIES"
                label="العملة"
              />
              <NumberField
                v-model="form.asking_price"
                label="السعر المطلوب"
                hint="يؤخذ من العرض إن تُرك فارغاً"
                persistent-hint
                :error-messages="fieldErrors.asking_price"
              />
              <v-textarea
                v-model="form.notes"
                class="form-section__wide"
                label="ملاحظات"
                rows="2"
                auto-grow
              />
            </FormSection>
          </div>
        </v-defaults-provider>
      </v-card-text>
      <v-divider />
      <v-card-actions>
        <span class="deal-review" :title="review">{{ review }}</span>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          type="submit"
          :loading="saving"
          prepend-icon="mdi-content-save-outline"
          title="حفظ (Ctrl+S)"
          aria-keyshortcuts="Control+S"
          >حفظ</v-btn
        >
        <v-btn variant="text" :disabled="saving" @click="open = false"
          >إلغاء</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.deal-owner {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  font-size: calc(13px * var(--dal-font-scale));
}
.deal-owner__label {
  color: var(--dal-muted);
}
.deal-owner__name {
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.deal-commission {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.deal-commission > :first-child {
  flex: 1 1 auto;
  min-width: 0;
}
.deal-commission .v-btn-toggle {
  flex: none;
  height: 40px;
}
.deal-more {
  margin-block: 4px;
}
.deal-review {
  min-width: 0;
  margin-inline-start: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: calc(12px * var(--dal-font-scale));
  color: var(--dal-muted);
}
</style>

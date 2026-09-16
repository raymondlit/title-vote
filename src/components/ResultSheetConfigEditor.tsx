import { ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_RESULT_SHEET_CONFIG,
  type ResultSheetConfig,
} from "@/components/ResultSheet";

type Props = {
  value: ResultSheetConfig;
  onChange: (config: ResultSheetConfig) => void;
  onSave: () => void;
  saving: boolean;
};

export function ResultSheetConfigEditor({ value, onChange, onSave, saving }: Props) {
  function patch(next: Partial<ResultSheetConfig>) {
    onChange({ ...value, ...next });
  }

  function moveColumn(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= value.columns.length) return;
    const columns = [...value.columns];
    const current = columns[index];
    const replacement = columns[target];
    if (!current || !replacement) return;
    columns[index] = replacement;
    columns[target] = current;
    patch({ columns });
  }

  return (
    <div className="space-y-10">
      <section>
        <h3 className="mb-5 text-[12px] tracking-[0.18em]">标题与说明</h3>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="学校标题">
            <Input
              value={value.schoolTitle}
              onChange={(event) => patch({ schoolTitle: event.target.value })}
              className="rounded-none"
            />
          </Field>
          <Field label="确认单标题">
            <Input
              value={value.documentTitle}
              onChange={(event) => patch({ documentTitle: event.target.value })}
              className="rounded-none"
            />
          </Field>
          <Field label="人数说明">
            <Input
              value={value.summaryTemplate}
              onChange={(event) => patch({ summaryTemplate: event.target.value })}
              className="rounded-none"
            />
          </Field>
          <Field label="自定义说明">
            <Textarea
              value={value.description}
              onChange={(event) => patch({ description: event.target.value })}
              className="min-h-20 rounded-none"
            />
          </Field>
        </div>
        <p className="mt-3 text-[10px] leading-6 tracking-[0.08em] text-muted-foreground">
          可使用：&#123;&#123;school&#125;&#125; 学校名称、&#123;&#123;session&#125;&#125; 投票名称、&#123;&#123;judgeCount&#125;&#125; 应到人数、&#123;&#123;submitted&#125;&#125; 实交人数
        </p>
      </section>

      <section>
        <h3 className="mb-5 text-[12px] tracking-[0.18em]">结果表字段</h3>
        <div className="divide-y border">
          {value.columns.map((column, index) => (
            <div key={column.key} className="flex items-center gap-3 px-4 py-3">
              <Checkbox
                checked={column.visible}
                onCheckedChange={(checked) =>
                  patch({
                    columns: value.columns.map((item) =>
                      item.key === column.key ? { ...item, visible: checked === true } : item,
                    ),
                  })
                }
                aria-label={`显示${column.label}字段`}
              />
              <Input
                value={column.label}
                onChange={(event) =>
                  patch({
                    columns: value.columns.map((item) =>
                      item.key === column.key ? { ...item, label: event.target.value } : item,
                    ),
                  })
                }
                className="h-8 flex-1 rounded-none"
                aria-label={`${column.label}列名`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === 0}
                onClick={() => moveColumn(index, -1)}
                title="上移"
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === value.columns.length - 1}
                onClick={() => moveColumn(index, 1)}
                title="下移"
              >
                <ArrowDown />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h3 className="text-[12px] tracking-[0.18em]">签字区域</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-none"
            onClick={() =>
              patch({
                signatures: [
                  ...value.signatures,
                  { id: crypto.randomUUID(), label: "签字", lines: 1, showDate: false },
                ],
              })
            }
          >
            <Plus /> 增加签字项
          </Button>
        </div>
        <div className="space-y-3">
          {value.signatures.map((signature) => (
            <div key={signature.id} className="grid items-end gap-3 border p-4 md:grid-cols-[1fr_120px_120px_40px]">
              <Field label="签字名称">
                <Input
                  value={signature.label}
                  onChange={(event) =>
                    patch({
                      signatures: value.signatures.map((item) =>
                        item.id === signature.id ? { ...item, label: event.target.value } : item,
                      ),
                    })
                  }
                  className="rounded-none"
                />
              </Field>
              <Field label="签字线数量">
                <Input
                  type="number"
                  min={1}
                  max={6}
                  value={signature.lines}
                  onChange={(event) =>
                    patch({
                      signatures: value.signatures.map((item) =>
                        item.id === signature.id
                          ? { ...item, lines: Math.min(6, Math.max(1, Number(event.target.value) || 1)) }
                          : item,
                      ),
                    })
                  }
                  className="rounded-none"
                />
              </Field>
              <label className="flex h-9 items-center gap-2 text-[11px] tracking-[0.12em] text-muted-foreground">
                <Checkbox
                  checked={signature.showDate}
                  onCheckedChange={(checked) =>
                    patch({
                      signatures: value.signatures.map((item) =>
                        item.id === signature.id ? { ...item, showDate: checked === true } : item,
                      ),
                    })
                  }
                />
                显示日期
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => patch({ signatures: value.signatures.filter((item) => item.id !== signature.id) })}
                title="删除签字项"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-5 text-[12px] tracking-[0.18em]">版式与页脚</h3>
        <div className="grid gap-5 md:grid-cols-3">
          <Field label="纸张方向">
            <Select value={value.orientation} onValueChange={(orientation) => patch({ orientation: orientation as ResultSheetConfig["orientation"] })}>
              <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="portrait">纵向</SelectItem>
                <SelectItem value="landscape">横向</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="字号">
            <Select value={value.fontSize} onValueChange={(fontSize) => patch({ fontSize: fontSize as ResultSheetConfig["fontSize"] })}>
              <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="small">小</SelectItem>
                <SelectItem value="medium">中</SelectItem>
                <SelectItem value="large">大</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="表格行距">
            <Select value={value.density} onValueChange={(density) => patch({ density: density as ResultSheetConfig["density"] })}>
              <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="compact">紧凑</SelectItem>
                <SelectItem value="comfortable">舒展</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-3">
            <Field label="页脚文字">
              <Textarea
                value={value.footer}
                onChange={(event) => patch({ footer: event.target.value })}
                className="min-h-16 rounded-none"
              />
            </Field>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-3 border-t pt-6">
        <Button type="button" onClick={onSave} disabled={saving} className="rounded-none px-6">
          <Save /> {saving ? "保存中" : "保存全校模板"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-none px-6"
          onClick={() => onChange(structuredClone(DEFAULT_RESULT_SHEET_CONFIG))}
        >
          <RotateCcw /> 恢复默认
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-[11px] tracking-[0.18em] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
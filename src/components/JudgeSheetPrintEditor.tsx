import type { ReactNode } from "react";
import { RotateCcw, Save } from "lucide-react";
import {
  DEFAULT_JUDGE_SHEET_PRINT_CONFIG,
  type JudgeSheetPrintConfig,
} from "@/components/JudgeBallotSheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  value: JudgeSheetPrintConfig;
  onChange: (value: JudgeSheetPrintConfig) => void;
  onSave: () => void;
  saving: boolean;
};

export function JudgeSheetPrintEditor({ value, onChange, onSave, saving }: Props) {
  const patch = (next: Partial<JudgeSheetPrintConfig>) => onChange({ ...value, ...next });

  return (
    <div className="space-y-7">
      <section>
        <h4 className="mb-4 text-[12px] tracking-[0.16em]">页眉内容</h4>
        <Field label="自定义页眉文字">
          <Input value={value.headerText} onChange={(event) => patch({ headerText: event.target.value })} className="rounded-none" placeholder="例如：内部资料 · 请妥善保管" />
        </Field>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Check label="显示学校名称" checked={value.showSchool} onChange={(checked) => patch({ showSchool: checked })} />
          <Check label="显示投票场次" checked={value.showSession} onChange={(checked) => patch({ showSession: checked })} />
          <Check label="显示评委姓名与单位" checked={value.showJudge} onChange={(checked) => patch({ showJudge: checked })} />
          <Check label="显示提交时间" checked={value.showSubmittedAt} onChange={(checked) => patch({ showSubmittedAt: checked })} />
          <Check label="续页重复页眉信息" checked={value.repeatPageHeading} onChange={(checked) => patch({ repeatPageHeading: checked })} />
        </div>
      </section>

      <section className="border-t pt-6">
        <h4 className="mb-4 text-[12px] tracking-[0.16em]">分页与页脚</h4>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={`每页显示人数（${value.rowsPerPage} 人）`}>
            <Slider min={8} max={28} step={1} value={[value.rowsPerPage]} onValueChange={([rows]) => patch({ rowsPerPage: rows ?? value.rowsPerPage })} />
          </Field>
          <Field label="自定义页脚文字">
            <Input value={value.footerText} onChange={(event) => patch({ footerText: event.target.value })} className="rounded-none" placeholder="例如：职称评审工作委员会" />
          </Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Check label="每页重复表头" checked={value.repeatTableHeader} onChange={(checked) => patch({ repeatTableHeader: checked })} />
          <Check label="显示第 X 页 / 共 Y 页" checked={value.showPageNumber} onChange={(checked) => patch({ showPageNumber: checked })} />
        </div>
      </section>

      <section className="border-t pt-6">
        <h4 className="mb-4 text-[12px] tracking-[0.16em]">签字线</h4>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="显示方式">
            <Select value={value.signatureMode} onValueChange={(signatureMode) => patch({ signatureMode: signatureMode as JudgeSheetPrintConfig["signatureMode"] })}>
              <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="last_page">仅最后一页</SelectItem>
                <SelectItem value="every_page">每页显示</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="横向位置">
            <Select value={value.signatureAlign} onValueChange={(signatureAlign) => patch({ signatureAlign: signatureAlign as JudgeSheetPrintConfig["signatureAlign"] })}>
              <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="left">靠左</SelectItem>
                <SelectItem value="center">居中</SelectItem>
                <SelectItem value="right">靠右</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={`签字区域宽度（${value.signatureWidth}%）`}>
            <Slider min={30} max={90} step={1} value={[value.signatureWidth]} onValueChange={([width]) => patch({ signatureWidth: width ?? value.signatureWidth })} />
          </Field>
          <Field label={`距页面底部（${value.signatureBottom} 毫米）`}>
            <Slider min={6} max={36} step={1} value={[value.signatureBottom]} onValueChange={([bottom]) => patch({ signatureBottom: bottom ?? value.signatureBottom })} />
          </Field>
        </div>
      </section>

      <p className="text-[10px] leading-5 text-muted-foreground">
        自定义文字可使用：&#123;&#123;school&#125;&#125;、&#123;&#123;session&#125;&#125;、&#123;&#123;judge&#125;&#125;、&#123;&#123;unit&#125;&#125;、&#123;&#123;submittedAt&#125;&#125;、&#123;&#123;page&#125;&#125;、&#123;&#123;pages&#125;&#125;
      </p>
      <div className="flex flex-wrap gap-3 border-t pt-5">
        <Button type="button" onClick={onSave} disabled={saving} className="rounded-none"><Save /> {saving ? "保存中" : "保存全校打印版式"}</Button>
        <Button type="button" variant="outline" className="rounded-none" onClick={() => onChange(structuredClone(DEFAULT_JUDGE_SHEET_PRINT_CONFIG))}><RotateCcw /> 恢复默认</Button>
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[11px] tracking-[0.08em] text-muted-foreground">
      <Checkbox checked={checked} onCheckedChange={(next) => onChange(next === true)} />
      {label}
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-3"><Label className="text-[11px] tracking-[0.12em] text-muted-foreground">{label}</Label>{children}</div>;
}
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  XCircle,
  Building2,
  Calendar,
  DollarSign,
  Users,
  FileText,
  Shield,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth';
import { getFieldErrors } from '@/lib/hooks/use-api';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { PageHeader } from '@/components/ui/page-header';

const stepSchema = {
  1: z.object({
    ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC format'),
    bankName: z.string().min(1),
    branchName: z.string().min(1),
  }),
  2: z
    .object({
      fdrNumber: z.string().min(1, 'FDR number is required'),
      amount: z.number().positive('Amount must be positive'),
      issueDate: z.string().min(1, 'Issue date is required'),
      maturityDate: z.string().min(1, 'Maturity date is required'),
      interestRate: z.number().min(0).max(100).optional(),
    })
    .refine((data) => new Date(data.maturityDate) > new Date(data.issueDate), {
      message: 'Maturity date must be after issue date',
      path: ['maturityDate'],
    }),
  3: z
    .object({
      jointHolders: z
        .array(
          z.object({
            name: z.string().min(1),
            pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN'),
            isAICTE: z.boolean(),
            percentage: z.number().min(0).max(100),
          })
        )
        .min(1, 'At least one joint holder required'),
    })
    .refine((data) => data.jointHolders.some((h) => h.isAICTE), {
      message: 'At least one joint holder must be AICTE',
      path: ['jointHolders'],
    })
    .refine((data) => data.jointHolders.reduce((sum, h) => sum + h.percentage, 0) === 100, {
      message: 'Percentages must sum to 100%',
      path: ['jointHolders'],
    }),
  4: z.object({
    documents: z
      .array(
        z.object({
          type: z.enum(['FDR_CERTIFICATE', 'BOARD_RESOLUTION', 'LIEN_LETTER', 'OTHER']),
          fileName: z.string(),
          fileUrl: z.string(),
          fileSize: z.number(),
          mimeType: z.string(),
          fileHash: z.string(),
        })
      )
      .min(1, 'At least one document required'),
  }),
};

type Step1Data = z.infer<(typeof stepSchema)[1]>;
type Step2Data = z.infer<(typeof stepSchema)[2]>;
type Step3Data = z.infer<(typeof stepSchema)[3]>;
type Step4Data = z.infer<(typeof stepSchema)[4]>;

interface UploadedDocument {
  type: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  fileHash: string;
}

const allFieldsSchema = z
  .object({
    ifscCode: stepSchema[1].shape.ifscCode,
    bankName: stepSchema[1].shape.bankName,
    branchName: stepSchema[1].shape.branchName,
    fdrNumber: stepSchema[2].innerType().shape.fdrNumber,
    amount: stepSchema[2].innerType().shape.amount,
    issueDate: stepSchema[2].innerType().shape.issueDate,
    maturityDate: stepSchema[2].innerType().shape.maturityDate,
    interestRate: stepSchema[2].innerType().shape.interestRate,
    jointHolders: stepSchema[3].innerType().innerType().shape.jointHolders,
    documents: stepSchema[4].shape.documents,
  })
  .superRefine((data, ctx) => {
    if (new Date(data.maturityDate) <= new Date(data.issueDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Maturity date must be after issue date',
        path: ['maturityDate'],
      });
    }
    if (!data.jointHolders.some((h) => h.isAICTE)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one joint holder must be AICTE',
        path: ['jointHolders'],
      });
    }
    if (data.jointHolders.reduce((sum, h) => sum + h.percentage, 0) !== 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Percentages must sum to 100%',
        path: ['jointHolders'],
      });
    }
  });
type AllFields = z.infer<typeof allFieldsSchema>;

const steps = [
  {
    id: 1,
    label: 'Bank Details',
    icon: Building2,
    description: 'Enter bank and branch information',
  },
  {
    id: 2,
    label: 'FDR Details',
    icon: DollarSign,
    description: 'Enter FDR amount, dates, and interest',
  },
  { id: 3, label: 'Joint Holders', icon: Users, description: 'Add joint holders with PAN details' },
  { id: 4, label: 'Documents', icon: FileText, description: 'Upload required documents' },
  { id: 5, label: 'Review', icon: Shield, description: 'Review and submit' },
];

export default function SubmitFDRPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bankInfo, setBankInfo] = useState<{
    name: string;
    branchName: string;
    bankId: string;
  } | null>(null);
  const [documents, setDocuments] = useState<File[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);

  const form = useForm<AllFields>({
    resolver: zodResolver(allFieldsSchema),
    defaultValues: {
      ifscCode: '',
      bankName: '',
      branchName: '',
      fdrNumber: '',
      amount: 0,
      issueDate: new Date().toISOString().split('T')[0],
      maturityDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      interestRate: 0,
      jointHolders: [{ name: '', pan: '', isAICTE: true, percentage: 100 }],
      documents: [],
    },
    mode: 'onChange',
  });

  const watchIFSC = form.watch('ifscCode');

  // Auto-fetch bank details on IFSC change
  useEffect(() => {
    if (watchIFSC && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(watchIFSC.toUpperCase())) {
      fetchBankDetails(watchIFSC.toUpperCase());
    }
  }, [watchIFSC]);

  const fetchBankDetails = async (ifsc: string) => {
    try {
      // The client unwraps the envelope, so the branch is already `data`.
      const response: any = await api.get('/directory/ifsc/' + ifsc);
      const branch = response?.data;
      if (!branch?.bankName) {
        setBankInfo(null);
        return;
      }
      setBankInfo({
        name: branch.bankName,
        branchName: branch.branchName,
        bankId: branch.bankId,
      });
      form.setValue('bankName', branch.bankName, { shouldValidate: true });
      form.setValue('branchName', branch.branchName, { shouldValidate: true });
    } catch {
      setBankInfo(null);
      form.setValue('bankName', '');
      form.setValue('branchName', '');
    }
  };

  const handleNext = async () => {
    const stepSchemaMap: Record<number, any> = {
      1: stepSchema[1],
      2: stepSchema[2],
      3: stepSchema[3],
      4: stepSchema[4],
    };

    try {
      await stepSchemaMap[currentStep].parseAsync(form.getValues());
      if (currentStep < 5) {
        setCurrentStep(currentStep + 1);
      }
    } catch (error: any) {
      const issue = error?.issues?.[0];
      toast.error('Check this step', {
        description: issue
          ? `${issue.path.join('.')}: ${issue.message}`
          : 'Some fields are still incomplete.',
      });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const router = useRouter();
  const institutionId = useAuthStore((state) => state.user?.institutionId);

  /**
   * Creates the FDR, attaches the uploaded documents, then submits it. Doing
   * this in three calls mirrors the real workflow: a draft can exist without
   * documents, and only a complete record may be submitted for verification.
   */
  const handleSubmit = async (data: AllFields) => {
    if (!institutionId) {
      toast.error('No institution linked', {
        description: 'Your account is not attached to an institution. Contact an administrator.',
      });
      return;
    }

    if (!bankInfo?.bankId) {
      toast.error('Bank not recognised', {
        description: 'Enter a valid IFSC code so the branch can be identified.',
      });
      setCurrentStep(1);
      return;
    }

    setIsSubmitting(true);
    try {
      const created: any = await api.post('/fdrs', {
        institutionId,
        fdrNumber: data.fdrNumber,
        bankId: bankInfo.bankId,
        bankName: data.bankName,
        branchName: data.branchName,
        ifscCode: data.ifscCode.toUpperCase(),
        amount: data.amount,
        issueDate: new Date(data.issueDate).toISOString(),
        maturityDate: new Date(data.maturityDate).toISOString(),
        interestRate: data.interestRate || undefined,
        jointHolders: data.jointHolders,
        documents: data.documents,
        status: 'DRAFT',
      });

      const fdrId = created?.data?.id;
      if (!fdrId) throw new Error('The server did not return a record id');

      await api.post(`/fdrs/${fdrId}/submit`, {});

      toast.success('FDR submitted', {
        description: 'It is now awaiting bank verification.',
      });
      router.push(`/dashboard/institution/fdrs/${fdrId}`);
    } catch (error: any) {
      const message =
        error?.response?.error?.message ||
        (error?.message === 'Network Error'
          ? 'Cannot reach the server.'
          : (error?.message ?? 'Submission failed'));

      // Push server-side field errors onto the form so the user sees them inline.
      const fieldErrors = getFieldErrors(error);
      for (const [field, text] of Object.entries(fieldErrors)) {
        if (field in form.getValues()) {
          (form.setError as any)(field, { type: 'server', message: text });
        }
      }

      toast.error('Could not submit this FDR', { description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addJointHolder = () => {
    const holders = form.getValues('jointHolders');
    form.setValue('jointHolders', [
      ...holders,
      { name: '', pan: '', isAICTE: false, percentage: 0 },
    ]);
  };

  const removeJointHolder = (index: number) => {
    const holders = form.getValues('jointHolders');
    if (holders.length > 1) {
      form.setValue(
        'jointHolders',
        holders.filter((_: any, i: number) => i !== index)
      );
    }
  };

  const updateJointHolder = (index: number, field: string, value: any) => {
    const holders = form.getValues('jointHolders');
    const updated = [...holders];
    updated[index] = { ...updated[index], [field]: value };
    form.setValue('jointHolders', updated);
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-center gap-2">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors sm:h-10 sm:w-10',
                    index + 1 < currentStep
                      ? 'bg-primary text-primary-foreground'
                      : index + 1 === currentStep
                        ? 'bg-primary/10 text-primary border-primary border-2'
                        : 'bg-muted text-muted-foreground'
                  )}
                >
                  {index + 1 < currentStep ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <step.icon className="h-5 w-5" />
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'hidden h-0.5 flex-1 transition-colors sm:block sm:w-20',
                      index + 1 < currentStep ? 'bg-primary' : 'bg-muted'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-center text-sm">
            Step {currentStep} of {steps.length}: {steps[currentStep - 1].label} -{' '}
            {steps[currentStep - 1].description}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {(() => {
                  const StepIcon = steps[currentStep - 1].icon;
                  return <StepIcon className="h-5 w-5" />;
                })()}
                Step {currentStep}: {steps[currentStep - 1].label}
              </CardTitle>
              <CardDescription>{steps[currentStep - 1].description}</CardDescription>
            </CardHeader>
            <CardContent>
              {currentStep === 1 && <Step1BankDetails form={form} bankInfo={bankInfo} />}
              {currentStep === 2 && <Step2FDRDetails form={form} />}
              {currentStep === 3 && (
                <Step3JointHolders
                  form={form}
                  addJointHolder={addJointHolder}
                  removeJointHolder={removeJointHolder}
                  updateJointHolder={updateJointHolder}
                />
              )}
              {currentStep === 4 && (
                <Step4Documents
                  form={form}
                  documents={documents}
                  setDocuments={setDocuments}
                  uploadedDocs={uploadedDocs}
                  setUploadedDocs={setUploadedDocs}
                />
              )}
              {currentStep === 5 && (
                <Step5Review
                  form={form}
                  bankInfo={bankInfo}
                  uploadedDocs={uploadedDocs}
                  setCurrentStep={setCurrentStep}
                />
              )}
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex justify-between border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div className="flex gap-3">
              {currentStep < 5 ? (
                <Button type="button" onClick={handleNext}>
                  Next
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" loading={isSubmitting}>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submit FDR
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}

// Step Components
function Step1BankDetails({ form, bankInfo }: { form: any; bankInfo: any }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ifscCode">
          IFSC Code <span className="text-red-500">*</span>
        </Label>
        <Input
          id="ifscCode"
          placeholder="SBIN0001234"
          {...form.register('ifscCode')}
          onBlur={(e) => form.setValue('ifscCode', e.target.value.toUpperCase())}
        />
        {form.formState.errors.ifscCode && (
          <p className="text-destructive text-sm">{form.formState.errors.ifscCode.message}</p>
        )}
      </div>

      {bankInfo && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <p className="text-sm text-green-800 dark:text-green-200">
            <strong>Bank found:</strong> {bankInfo.name} - {bankInfo.branchName}
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bankName">
            Bank Name <span className="text-red-500">*</span>
          </Label>
          <Input id="bankName" {...form.register('bankName')} disabled={!!bankInfo} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="branchName">
            Branch Name <span className="text-red-500">*</span>
          </Label>
          <Input id="branchName" {...form.register('branchName')} disabled={!!bankInfo} />
        </div>
      </div>
    </div>
  );
}

function Step2FDRDetails({ form }: { form: any }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fdrNumber">
          FDR Number <span className="text-red-500">*</span>
        </Label>
        <Input id="fdrNumber" placeholder="FDR-2024-001234" {...form.register('fdrNumber')} />
        {form.formState.errors.fdrNumber && (
          <p className="text-destructive text-sm">{form.formState.errors.fdrNumber.message}</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amount">
            Amount (INR) <span className="text-red-500">*</span>
          </Label>
          <Input
            id="amount"
            type="number"
            placeholder="5000000"
            {...form.register('amount', { valueAsNumber: true })}
          />
          {form.formState.errors.amount && (
            <p className="text-destructive text-sm">{form.formState.errors.amount.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="interestRate">Interest Rate (%)</Label>
          <Input
            id="interestRate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            placeholder="7.5"
            {...form.register('interestRate', { valueAsNumber: true })}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="issueDate">
            Issue Date <span className="text-red-500">*</span>
          </Label>
          <Input id="issueDate" type="date" {...form.register('issueDate')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maturityDate">
            Maturity Date <span className="text-red-500">*</span>
          </Label>
          <Input id="maturityDate" type="date" {...form.register('maturityDate')} />
          {form.formState.errors.maturityDate && (
            <p className="text-destructive text-sm">{form.formState.errors.maturityDate.message}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Step3JointHolders({
  form,
  addJointHolder,
  removeJointHolder,
  updateJointHolder,
}: {
  form: any;
  addJointHolder: () => void;
  removeJointHolder: (index: number) => void;
  updateJointHolder: (index: number, field: string, value: any) => void;
}) {
  const jointHolders = form.watch('jointHolders');

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        At least one joint holder must be AICTE. Percentages must sum to 100%.
      </p>

      {jointHolders.map((holder: any, index: number) => (
        <Card key={index} className="mb-4">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Joint Holder {index + 1}</CardTitle>
            {jointHolders.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeJointHolder(index)}
              >
                <XCircle className="text-destructive h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`holder-name-${index}`}>
                  Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id={`holder-name-${index}`}
                  {...form.register(`jointHolders.${index}.name`)}
                  onChange={(e) => updateJointHolder(index, 'name', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`holder-pan-${index}`}>
                  PAN <span className="text-red-500">*</span>
                </Label>
                <Input
                  id={`holder-pan-${index}`}
                  placeholder="ABCDE1234F"
                  {...form.register(`jointHolders.${index}.pan`)}
                  onChange={(e) => updateJointHolder(index, 'pan', e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor={`holder-percentage-${index}`}>
                  Percentage (%) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id={`holder-percentage-${index}`}
                  type="number"
                  min="0"
                  max="100"
                  {...form.register(`jointHolders.${index}.percentage`, { valueAsNumber: true })}
                  onChange={(e) =>
                    updateJointHolder(index, 'percentage', parseFloat(e.target.value) || 0)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>AICTE Holder</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`holder-isAICTE-${index}`}
                    checked={holder.isAICTE}
                    onChange={(e) => updateJointHolder(index, 'isAICTE', e.target.checked)}
                    className="text-primary focus:ring-primary h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm">Mark as AICTE</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Validation</Label>
                <Badge variant={holder.isAICTE ? 'success' : 'secondary'}>
                  {holder.isAICTE ? 'AICTE' : 'Institution'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {jointHolders.length < 10 && (
        <Button type="button" variant="outline" onClick={addJointHolder} className="w-full">
          <Users className="mr-2 h-4 w-4" />
          Add Joint Holder
        </Button>
      )}

      {/* Percentage Sum Indicator */}
      <div className="bg-muted/50 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Total Percentage</span>
          <span
            className={cn(
              'text-lg font-bold',
              jointHolders.reduce((sum: number, h: any) => sum + (h.percentage || 0), 0) === 100
                ? 'text-green-600'
                : 'text-red-600'
            )}
          >
            {jointHolders.reduce((sum: number, h: any) => sum + (h.percentage || 0), 0)}%
          </span>
        </div>
        {jointHolders.reduce((sum: number, h: any) => sum + (h.percentage || 0), 0) !== 100 && (
          <p className="mt-1 text-xs text-red-600">Percentages must sum to 100%</p>
        )}
      </div>
    </div>
  );
}

function Step4Documents({
  form,
  documents,
  setDocuments,
  uploadedDocs,
  setUploadedDocs,
}: {
  form: any;
  documents: File[];
  setDocuments: React.Dispatch<React.SetStateAction<File[]>>;
  uploadedDocs: UploadedDocument[];
  setUploadedDocs: React.Dispatch<React.SetStateAction<UploadedDocument[]>>;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [documentType, setDocumentType] = useState('FDR_CERTIFICATE');

  const documentTypes = [
    { value: 'FDR_CERTIFICATE', label: 'FDR Certificate' },
    { value: 'BOARD_RESOLUTION', label: 'Board Resolution' },
    { value: 'LIEN_LETTER', label: 'Lien Letter' },
    { value: 'OTHER', label: 'Other' },
  ];

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setDocuments((prev: File[]) => [...prev, ...files]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setDocuments((prev: File[]) => [...prev, ...files]);
    }
  };

  const uploadFiles = async () => {
    setUploading(true);
    try {
      const results: UploadedDocument[] = [];
      for (const file of documents) {
        const response: any = await api.upload('/uploads', file);
        const uploaded = response?.data;
        if (!uploaded?.fileUrl) throw new Error('The upload did not return a file URL');

        results.push({
          type: documentType,
          fileName: uploaded.fileName ?? file.name,
          fileUrl: uploaded.fileUrl,
          fileSize: uploaded.fileSize ?? file.size,
          mimeType: uploaded.mimeType ?? file.type,
          fileHash: uploaded.fileHash,
        });
      }
      setUploadedDocs((prev: UploadedDocument[]) => [...prev, ...results]);
      setDocuments([]);
      toast.success(`${results.length} document${results.length === 1 ? '' : 's'} uploaded`);
      form.setValue('documents', [...uploadedDocs, ...results] as any, { shouldValidate: true });
    } catch (error: any) {
      const message =
        error?.response?.error?.message ||
        error?.message ||
        'Upload failed. Check the file type and size.';
      toast.error('Upload failed', { description: message });
    } finally {
      setUploading(false);
    }
  };

  const removeDocument = (index: number) => {
    setDocuments((prev: File[]) => prev.filter((_: File, i: number) => i !== index));
  };

  const removeUploadedDoc = (index: number) => {
    setUploadedDocs((prev: UploadedDocument[]) =>
      prev.filter((_: UploadedDocument, i: number) => i !== index)
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="document-type" className="text-[13px]">
          Document type
        </Label>
        <select
          id="document-type"
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value)}
          className="border-input bg-background focus-visible:ring-primary flex h-10 w-full rounded-lg border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          {documentTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-[11px]">
          Files you add below are uploaded with this type. Both the FDR certificate and the board
          resolution are required before submission.
        </p>
      </div>

      <div
        className={cn(
          'rounded-lg border-2 border-dashed p-8 text-center transition-colors',
          dragActive ? 'border-primary bg-primary/5' : 'border-muted'
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragActive(false);
        }}
        onDrop={handleDrop}
      >
        <input
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload"
        />
        <label htmlFor="file-upload" className="cursor-pointer">
          <FileText className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
          <p className="mb-1 text-lg font-medium">Drag & drop documents here</p>
          <p className="text-muted-foreground text-sm">
            or click to browse (PDF, JPG, PNG - max 10MB each)
          </p>
        </label>
      </div>

      {documents.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">Pending Upload ({documents.length})</h4>
          {documents.map((file, index) => (
            <div
              key={index}
              className="bg-muted/50 flex items-center justify-between rounded-lg p-3"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5" />
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeDocument(index)}
              >
                <XCircle className="text-destructive h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button onClick={uploadFiles} disabled={uploading} className="w-full">
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              'Upload All Documents'
            )}
          </Button>
        </div>
      )}

      {uploadedDocs.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">Uploaded Documents ({uploadedDocs.length})</h4>
          {uploadedDocs.map((doc, index) => (
            <div key={index} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium">{doc.fileName}</p>
                  <p className="text-muted-foreground text-xs capitalize">
                    {doc.type.replace(/_/g, ' ')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-sm hover:underline"
                >
                  View
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeUploadedDoc(index)}
                >
                  <XCircle className="text-destructive h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {uploadedDocs.length === 0 && documents.length === 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
          <AlertCircle className="mb-2 h-5 w-5 text-yellow-600" />
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            At least one document is required. Please upload the FDR Certificate and Board
            Resolution.
          </p>
        </div>
      )}
    </div>
  );
}

function Step5Review({
  form,
  bankInfo,
  uploadedDocs,
  setCurrentStep,
}: {
  form: any;
  bankInfo: any;
  uploadedDocs: any[];
  setCurrentStep: (step: number) => void;
}) {
  const data = form.getValues();

  return (
    <div className="space-y-6">
      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="mb-4 flex items-center gap-2 font-medium">
          <Shield className="h-5 w-5" />
          Review all details before submitting
        </h4>
        <p className="text-muted-foreground text-sm">
          Once submitted, the FDR will be sent for bank verification. You can save as draft and
          submit later.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Bank Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Bank Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ReviewRow label="IFSC Code" value={data.ifscCode} />
            <ReviewRow label="Bank" value={data.bankName} />
            <ReviewRow label="Branch" value={data.branchName} />
          </CardContent>
        </Card>

        {/* FDR Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              FDR Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ReviewRow label="FDR Number" value={data.fdrNumber} />
            <ReviewRow label="Amount" value={formatCurrency(data.amount)} />
            <ReviewRow label="Issue Date" value={formatDate(data.issueDate)} />
            <ReviewRow label="Maturity Date" value={formatDate(data.maturityDate)} />
            <ReviewRow label="Interest Rate" value={`${data.interestRate || 0}%`} />
          </CardContent>
        </Card>

        {/* Joint Holders */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Joint Holders
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.jointHolders.map((holder: any, index: number) => (
              <div key={index} className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{holder.name}</span>
                  <Badge variant={holder.isAICTE ? 'success' : 'secondary'}>
                    {holder.isAICTE ? 'AICTE' : 'Institution'}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  PAN: {holder.pan} • {holder.percentage}%
                </p>
              </div>
            ))}
            <div className="text-right text-sm">
              Total:{' '}
              {data.jointHolders.reduce((sum: number, h: any) => sum + (h.percentage || 0), 0)}%
            </div>
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {uploadedDocs.map((doc: any, index: number) => (
              <div
                key={index}
                className="bg-muted/50 flex items-center justify-between rounded p-2"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-green-600" />
                  <span className="text-sm">{doc.fileName}</span>
                  <Badge variant="outline" className="text-xs">
                    {doc.type}
                  </Badge>
                </div>
              </div>
            ))}
            {uploadedDocs.length === 0 && (
              <p className="text-muted-foreground text-sm">No documents uploaded</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Submit Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => setCurrentStep(4)}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Edit Documents
        </Button>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function cn(...classes: (string | boolean | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

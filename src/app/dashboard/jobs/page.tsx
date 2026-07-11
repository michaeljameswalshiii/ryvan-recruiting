const handleAddJob = async () => {
  if (!newJobTitle || !newJobCompanyId || !newJobCompanyName) {
    alert("Job Title, Company ID, and Company Name are required");
    return;
  }

  try {
    await createJobMutation.mutateAsync({
      title: newJobTitle,
      description: newJobDescription,
      location: newJobLocation,
      salaryRange: newJobSalary,
      employmentType: newJobEmploymentType,
      companyId: newJobCompanyId,
      companyName: newJobCompanyName,
      status: "Open"
    });

    // Reset form
    setNewJobTitle("");
    setNewJobDescription("");
    setNewJobLocation("");
    setNewJobSalary("");
    setNewJobEmploymentType("Full-time");
    setNewJobCompanyId("");
    setNewJobCompanyName("");
    setIsAddDialogOpen(false);

    // Refresh the list
    refetch();
  } catch (err: any) {
    console.error("Add job error:", err);
    alert(`Failed to add job: ${err?.message || 'Unknown error'}`);
  }
};

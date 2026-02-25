class Admin::FeedbacksController < Admin::BaseController
  def index
    @feedbacks = paginate(Feedback.includes(:user).order(created_at: :desc))
  end

  def show
    @feedback = Feedback.find(params[:id])
  end

  def destroy
    Feedback.find(params[:id]).destroy
    redirect_to admin_feedbacks_path, notice: t("admin.feedbacks.notices.deleted")
  end
end

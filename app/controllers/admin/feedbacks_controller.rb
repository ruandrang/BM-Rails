class Admin::FeedbacksController < Admin::BaseController
  def index
    @feedbacks = paginate(Feedback.includes(:user).order(created_at: :desc))
  end

  def show
    @feedback = Feedback.find(params[:id])
  end

  def destroy
    Feedback.find(params[:id]).destroy
    redirect_to admin_feedbacks_path, notice: "피드백이 삭제되었습니다."
  end
end
